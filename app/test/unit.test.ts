import { describe, expect, it } from "vitest";
import { EMPTY_LIVE } from "../app/lib/protocol";
import { checkAccess } from "../workers/lib/access";
import { reduceLive } from "../workers/lib/live";
import { nextRun, validateCron } from "../workers/lib/schedule";
import { contextTokens, entriesToRows, wrapInput, type PiEntry } from "../workers/lib/thread";
import { reducer, INIT } from "../app/lib/use-bot";

const user = (id: number, content: string): PiEntry => ({ id, kind: "pi.user", model: [{ role: "user", content, timestamp: 1000 + id }] });
const assistant = (id: number, content: any[], extra: any = {}): PiEntry => ({
  id,
  kind: "pi.assistant",
  model: [{ role: "assistant", content, stopReason: "stop", timestamp: 1000 + id, usage: { totalTokens: 100 * id, cost: { total: 0.01 } }, ...extra }],
});

describe("entriesToRows", () => {
  it("turns user and assistant entries into rows", () => {
    const r = entriesToRows([user(1, "hi"), assistant(2, [{ type: "text", text: "hello" }])], 0);
    expect(r.rows.map((x) => [x.role, x.text])).toEqual([["user", "hi"], ["assistant", "hello"]]);
    expect(r.lastId).toBe(2);
    expect(r.cost).toBeCloseTo(0.01);
  });

  it("skips entries that were already synced", () => {
    const r = entriesToRows([user(1, "hi"), assistant(2, [{ type: "text", text: "hello" }])], 1);
    expect(r.rows).toHaveLength(1);
  });

  it("reads the origin label of a proactive input (D18)", () => {
    const r = entriesToRows([user(1, wrapInput("schedule: weekdays at 8am", "Summarize my inbox"))], 0);
    expect(r.rows[0]).toMatchObject({ role: "user", text: "Summarize my inbox", label: "schedule: weekdays at 8am" });
  });

  it("keeps one summary line for a tool call, not the raw output (D19)", () => {
    const big = "x".repeat(5000);
    const r = entriesToRows(
      [
        user(1, "find mail"),
        assistant(2, [{ type: "toolCall", id: "c1", name: "GMAIL_FETCH", arguments: { q: "from:sam" } }]),
        { id: 3, kind: "pi.tool-result", model: [{ role: "toolResult", toolCallId: "c1", toolName: "GMAIL_FETCH", content: [{ type: "text", text: big }], isError: false, timestamp: 1003 }] },
      ],
      0,
    );
    const tool = r.rows.find((x) => x.role === "tool")!;
    expect(tool.text.length).toBeLessThan(300);
    expect(tool.text).toContain("GMAIL_FETCH(q=from:sam)");
    expect(r.tools).toEqual(["GMAIL_FETCH"]);
  });

  it("makes a connect card from a Composio redirect link (D24)", () => {
    const r = entriesToRows(
      [
        assistant(1, [{ type: "toolCall", id: "c1", name: "COMPOSIO_MANAGE_CONNECTIONS", arguments: {} }]),
        { id: 2, kind: "pi.tool-result", model: [{ role: "toolResult", toolCallId: "c1", toolName: "COMPOSIO_MANAGE_CONNECTIONS", content: [{ type: "text", text: '{"toolkit":"gmail","redirect_url":"https://connect.composio.dev/link/lk_1"}' }], timestamp: 5 }] },
      ],
      0,
    );
    expect(r.rows[0]!.meta?.connect).toEqual({ toolkit: "gmail", url: "https://connect.composio.dev/link/lk_1" });
  });

  it("shows a model error as a system row", () => {
    const r = entriesToRows([assistant(1, [], { stopReason: "error", errorMessage: "401 bad key" })], 0);
    expect(r.errored).toBe(true);
    expect(r.rows[0]).toMatchObject({ role: "system" });
    expect(r.rows[0]!.text).toContain("401 bad key");
  });

  it("reports the context size from the newest assistant entry", () => {
    expect(contextTokens([user(1, "a"), assistant(2, []), assistant(3, [])])).toBe(300);
    expect(contextTokens([user(1, "a")])).toBe(0);
  });
});

describe("reduceLive", () => {
  it("follows a streamed answer and its tool calls", () => {
    let s = reduceLive(EMPTY_LIVE, { type: "run_start" });
    s = reduceLive(s, { type: "message_start", message: { role: "assistant" } });
    s = reduceLive(s, { type: "message_update", changes: [{ type: "text_delta", delta: "Hel" }] });
    s = reduceLive(s, { type: "message_update", changes: [{ type: "text_delta", delta: "lo" }] });
    expect(s).toMatchObject({ running: true, text: "Hello" });
    s = reduceLive(s, { type: "tool_execution_start", toolCallId: "a", toolName: "search_history" });
    expect(s.tools).toEqual([{ id: "a", name: "search_history", done: false }]);
    s = reduceLive(s, { type: "tool_execution_end", toolCallId: "a", toolName: "search_history" });
    expect(s.tools[0]!.done).toBe(true);
    expect(reduceLive(s, { type: "run_end" })).toEqual(EMPTY_LIVE);
  });

  it("keeps text from a block change", () => {
    const s = reduceLive(EMPTY_LIVE, { type: "message_update", changes: [{ type: "block", contentIndex: 0, block: { type: "text", text: "Hello" } }] });
    expect(s.text).toBe("Hello");
  });
});

describe("schedule helpers (D31)", () => {
  it("computes the next run in the owner time zone", () => {
    const from = new Date("2026-10-16T05:00:00Z");
    // 08:00 in Madrid (UTC+2 in October) is 06:00 UTC.
    expect(nextRun("0 8 * * *", "Europe/Madrid", from).toISOString()).toBe("2026-10-16T06:00:00.000Z");
  });
  it("skips the weekend", () => {
    const fri = new Date("2026-10-16T12:00:00Z"); // a Friday
    expect(nextRun("0 8 * * 1-5", "UTC", fri).toISOString()).toBe("2026-10-19T08:00:00.000Z");
  });
  it("rejects bad cron", () => {
    expect(() => validateCron("every day", "UTC")).toThrow();
    expect(() => validateCron("0 8 * * *", "UTC")).not.toThrow();
  });
});

describe("Cloudflare Access check (D1)", () => {
  const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });
  it("allows local requests when Access is not set up", async () => {
    expect(await checkAccess(req("http://localhost:5173/"), {} as any)).toBeNull();
  });
  it("refuses other hosts when Access is not set up", async () => {
    const res = await checkAccess(req("https://durabot.example.workers.dev/"), {} as any);
    expect(res?.status).toBe(403);
  });
  it("refuses a request without a token when Access is set up", async () => {
    const res = await checkAccess(req("https://x.dev/"), { ACCESS_TEAM_DOMAIN: "t.cloudflareaccess.com", ACCESS_AUD: "a" } as any);
    expect(res?.status).toBe(403);
  });
  it("refuses a bad token", async () => {
    const res = await checkAccess(req("https://x.dev/", { "cf-access-jwt-assertion": "nope" }), { ACCESS_TEAM_DOMAIN: "t.cloudflareaccess.com", ACCESS_AUD: "a" } as any);
    expect(res?.status).toBe(403);
  });
});

describe("client thread reducer", () => {
  const row = (id: number, role: any, text: string, label?: string) => ({ id, ts: id, role, text, label });
  it("replaces an optimistic message when the real row arrives", () => {
    let s = reducer(INIT, { type: "pending", pending: { id: "p1", text: "hi", ts: 1 } });
    s = reducer(s, { type: "server", msg: { type: "log_append", rows: [row(1, "user", "hi")] } });
    expect(s.pending).toHaveLength(0);
    expect(s.rows).toHaveLength(1);
  });
  it("does not settle a pending message with a labeled proactive row", () => {
    let s = reducer(INIT, { type: "pending", pending: { id: "p1", text: "hi", ts: 1 } });
    s = reducer(s, { type: "server", msg: { type: "log_append", rows: [row(1, "user", "hi", "schedule: x")] } });
    expect(s.pending).toHaveLength(1);
  });
  it("merges older rows without duplicates and in order", () => {
    let s = reducer(INIT, { type: "server", msg: { type: "history", rows: [row(5, "user", "e"), row(6, "assistant", "f")], hasMore: true, config: {} as any, live: { running: false, text: "", tools: [] } } });
    s = reducer(s, { type: "server", msg: { type: "older", rows: [row(3, "user", "c"), row(4, "assistant", "d"), row(5, "user", "e")], hasMore: false } });
    expect(s.rows.map((r) => r.id)).toEqual([3, 4, 5, 6]);
    expect(s.hasMore).toBe(false);
  });
});
