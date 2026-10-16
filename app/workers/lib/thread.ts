import type { LogRow, RowMeta, RowRole } from "../../app/lib/protocol";

/** The tagged-template SQL helper of the Agents SDK. */
export type Sql = <T = Record<string, string | number | boolean | null>>(
  strings: TemplateStringsArray,
  ...values: (string | number | boolean | null)[]
) => T[];

/** One Pi transcript entry, as plain JSON (the shape that `session.messages()` gives). */
export interface PiEntry {
  id: number;
  kind: string;
  model?: any[];
  data?: any;
}

export function initThreadSchema(exec: (sql: string) => void) {
  exec(`CREATE TABLE IF NOT EXISTS thread_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    label TEXT,
    meta TEXT
  )`);
  exec(`CREATE VIRTUAL TABLE IF NOT EXISTS thread_fts USING fts5(
    text, content='thread_log', content_rowid='id', tokenize='porter unicode61'
  )`);
  exec(`CREATE TRIGGER IF NOT EXISTS thread_ai AFTER INSERT ON thread_log BEGIN
    INSERT INTO thread_fts(rowid, text) VALUES (new.id, new.text);
  END`);
  exec(`CREATE TRIGGER IF NOT EXISTS thread_ad AFTER DELETE ON thread_log BEGIN
    INSERT INTO thread_fts(thread_fts, rowid, text) VALUES ('delete', old.id, old.text);
  END`);
  exec(`CREATE TRIGGER IF NOT EXISTS thread_au AFTER UPDATE ON thread_log BEGIN
    INSERT INTO thread_fts(thread_fts, rowid, text) VALUES ('delete', old.id, old.text);
    INSERT INTO thread_fts(rowid, text) VALUES (new.id, new.text);
  END`);
  exec(`CREATE TABLE IF NOT EXISTS bot_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
}

interface RawRow {
  id: number;
  ts: number;
  role: string;
  text: string;
  label: string | null;
  meta: string | null;
}

function toRow(r: RawRow): LogRow {
  return {
    id: r.id,
    ts: r.ts,
    role: r.role as RowRole,
    text: r.text,
    label: r.label,
    meta: r.meta ? (JSON.parse(r.meta) as RowMeta) : null,
  };
}

export function appendRow(
  sql: Sql,
  row: { ts?: number; role: RowRole; text: string; label?: string | null; meta?: RowMeta | null },
): LogRow {
  const ts = row.ts ?? Date.now();
  const meta = row.meta ? JSON.stringify(row.meta) : null;
  const out = sql<RawRow>`INSERT INTO thread_log (ts, role, text, label, meta)
    VALUES (${ts}, ${row.role}, ${row.text}, ${row.label ?? null}, ${meta})
    RETURNING id, ts, role, text, label, meta`;
  return toRow(out[0]!);
}

export function getRow(sql: Sql, id: number): LogRow | undefined {
  const r = sql<RawRow>`SELECT id, ts, role, text, label, meta FROM thread_log WHERE id = ${id}`[0];
  return r ? toRow(r) : undefined;
}

export function updateRowMeta(sql: Sql, id: number, meta: RowMeta) {
  sql`UPDATE thread_log SET meta = ${JSON.stringify(meta)} WHERE id = ${id}`;
}

/** The newest `limit` rows before `before` (or the newest rows), oldest first. */
export function pageRows(sql: Sql, before: number | null, limit: number): { rows: LogRow[]; hasMore: boolean } {
  const raw =
    before == null
      ? sql<RawRow>`SELECT id, ts, role, text, label, meta FROM thread_log ORDER BY id DESC LIMIT ${limit + 1}`
      : sql<RawRow>`SELECT id, ts, role, text, label, meta FROM thread_log WHERE id < ${before} ORDER BY id DESC LIMIT ${limit + 1}`;
  const hasMore = raw.length > limit;
  return { rows: raw.slice(0, limit).reverse().map(toRow), hasMore };
}

export function getMeta(sql: Sql, key: string): string | null {
  return sql<{ value: string }>`SELECT value FROM bot_meta WHERE key = ${key}`[0]?.value ?? null;
}

export function setMeta(sql: Sql, key: string, value: string) {
  sql`INSERT INTO bot_meta (key, value) VALUES (${key}, ${value})
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
}

export interface SearchHit {
  id: number;
  ts: number;
  role: string;
  snippet: string;
}

/** BM25 search over the full history (D17). */
export function searchHistory(sql: Sql, query: string, limit = 8): SearchHit[] {
  const tokens = query.match(/[\p{L}\p{N}_]+/gu) ?? [];
  if (tokens.length === 0) return [];
  const match = tokens.map((t) => `"${t}"`).join(" OR ");
  return sql<SearchHit>`SELECT t.id AS id, t.ts AS ts, t.role AS role,
      snippet(thread_fts, 0, '[', ']', '…', 28) AS snippet
    FROM thread_fts JOIN thread_log t ON t.id = thread_fts.rowid
    WHERE thread_fts MATCH ${match}
    ORDER BY bm25(thread_fts) LIMIT ${Math.min(Math.max(limit, 1), 20)}`;
}

/** The last `n` user and assistant rows, oldest first, for a handoff (D16). */
export function lastTurns(sql: Sql, n: number): LogRow[] {
  return sql<RawRow>`SELECT id, ts, role, text, label, meta FROM thread_log
    WHERE role IN ('user', 'assistant') ORDER BY id DESC LIMIT ${n}`
    .reverse()
    .map(toRow);
}

// ---------------------------------------------------------------- Pi entries to rows

const FROM_PREFIX = /^\[\[from:([^\]]*)\]\]\n/;

/** Mark an input that did not come from the owner (D18). The model also sees the mark. */
export function wrapInput(label: string, text: string): string {
  return `[[from:${label.replace(/[\]\n]/g, " ")}]]\n${text}`;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p: any) => p?.type === "text" && typeof p.text === "string")
    .map((p: any) => p.text)
    .join("");
}

function short(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
}

function shortArgs(args: unknown): string {
  if (args == null || typeof args !== "object") return "";
  const parts = Object.entries(args as Record<string, unknown>).map(([k, v]) => {
    const val = typeof v === "string" ? v : JSON.stringify(v);
    return `${k}=${short(val ?? "", 40)}`;
  });
  return short(parts.join(", "), 90);
}

function findRedirect(text: string): string | undefined {
  const m = text.match(/"(?:redirect_url|redirectUrl|redirect_uri)"\s*:\s*"([^"]+)"/);
  return m?.[1]?.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
}

export interface SyncResult {
  rows: Omit<LogRow, "id">[];
  lastId: number;
  /** Names of tools that finished in the new entries. */
  tools: string[];
  /** Sum of assistant message cost in the new entries. */
  cost: number;
  /** True if an assistant entry ended with an error. */
  errored: boolean;
}

/**
 * Turn Pi transcript entries newer than `after` into display rows (D19).
 * Raw tool output is not kept: a tool row holds one summary line.
 */
export function entriesToRows(entries: PiEntry[], after: number): SyncResult {
  const calls = new Map<string, { name: string; args: unknown }>();
  for (const e of entries) {
    if (e.kind !== "pi.assistant") continue;
    for (const p of e.model?.[0]?.content ?? []) {
      if (p?.type === "toolCall") calls.set(p.id, { name: p.name, args: p.arguments });
    }
  }
  const out: SyncResult = { rows: [], lastId: after, tools: [], cost: 0, errored: false };
  for (const e of entries) {
    if (e.id <= after) continue;
    out.lastId = Math.max(out.lastId, e.id);
    const m = e.model?.[0];
    if (!m) continue;
    if (e.kind === "pi.user") {
      let text = textOf(m.content);
      let label: string | null = null;
      const f = text.match(FROM_PREFIX);
      if (f) {
        label = f[1] ?? null;
        text = text.slice(f[0].length);
      }
      out.rows.push({ ts: m.timestamp ?? Date.now(), role: "user", text, label });
    } else if (e.kind === "pi.assistant") {
      out.cost += Number(m.usage?.cost?.total ?? 0);
      if (m.stopReason === "error" || m.stopReason === "aborted") {
        if (m.stopReason === "error") out.errored = true;
        const msg = m.errorMessage ? short(String(m.errorMessage), 300) : m.stopReason;
        out.rows.push({ ts: m.timestamp ?? Date.now(), role: "system", text: `Model ${m.stopReason}: ${msg}` });
        continue;
      }
      const text = textOf(m.content).trim();
      if (text) out.rows.push({ ts: m.timestamp ?? Date.now(), role: "assistant", text });
    } else if (e.kind === "pi.tool-result") {
      const call = calls.get(m.toolCallId);
      const name = m.toolName ?? call?.name ?? "tool";
      out.tools.push(name);
      const result = textOf(m.content);
      const text = `${name}(${shortArgs(call?.args)}) → ${m.isError ? "error: " : ""}${short(result, 140)}`;
      const row: Omit<LogRow, "id"> = { ts: m.timestamp ?? Date.now(), role: "tool", text };
      const url = findRedirect(result);
      if (url) row.meta = { connect: { toolkit: guessToolkit(result), url } };
      out.rows.push(row);
    }
  }
  return out;
}

function guessToolkit(text: string): string | undefined {
  return text.match(/"(?:toolkit|toolkit_slug|app)"\s*:\s*"([a-z0-9_-]+)"/i)?.[1];
}

/** Context size: total tokens of the newest assistant entry (spike point 2). */
export function contextTokens(entries: PiEntry[]): number {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    if (e.kind === "pi.assistant") return Number(e.model?.[0]?.usage?.totalTokens ?? 0);
  }
  return 0;
}
