import { env } from "cloudflare:test";
import { getAgentByName } from "agents";
import migration from "../migrations/0001_init.sql?raw";
import type { BotConfig, LogRow } from "../app/lib/protocol";

const e = env as any;

/** Create the D1 tables once for this test file. */
export async function setupDb() {
  const statements = migration
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  await e.DB.batch(statements.map((s: string) => e.DB.prepare(s)));
}

export function config(over: Partial<BotConfig> = {}): BotConfig {
  return {
    id: `t-${crypto.randomUUID().slice(0, 8)}`,
    name: "Tester",
    emoji: "🧪",
    kind: "bot",
    persona: "You test things.",
    model: "faux-1",
    toolkits: [],
    schedules: [],
    triggers: [],
    ...over,
  };
}

export async function makeBot(over: Partial<BotConfig> = {}) {
  const cfg = config(over);
  const stub = await getAgentByName(e.BotAgent, cfg.id);
  await stub.initConfig(cfg);
  return { cfg, stub };
}

/** Poll until `pick` returns a value. */
export async function until<T>(pick: () => Promise<T | undefined | false>, ms = 15000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await pick();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("Timed out");
    await new Promise((r) => setTimeout(r, 100));
  }
}

export async function allRows(stub: { rows(b: number | null): Promise<{ rows: LogRow[] }> }): Promise<LogRow[]> {
  return (await stub.rows(null)).rows;
}

export const testEnv = e;
