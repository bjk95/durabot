import { getAgentByName } from "agents";
import { beforeAll, describe, expect, it } from "vitest";
import { allRows, makeBot, setupDb, testEnv, until } from "./helpers";

beforeAll(setupDb);

const hasRow = (rows: any[], role: string, includes: string) => rows.find((r) => r.role === role && r.text.includes(includes));

describe("BotAgent chat", () => {
  it("answers a chat message and logs it as one thread", async () => {
    const { stub } = await makeBot();
    await stub.ingest("chat", "hello there");
    const rows = await until(async () => {
      const r = await allRows(stub);
      return hasRow(r, "assistant", "ECHO: hello there") && r;
    });
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant"]);
    expect(rows[0]!.text).toBe("hello there");
  });

  it("runs a tool and keeps one summary row", async () => {
    const { stub } = await makeBot();
    await stub.ingest("chat", "first message about pineapples");
    await until(async () => hasRow(await allRows(stub), "assistant", "ECHO: first"));
    await stub.ingest("chat", 'TOOL:search_history:{"query":"pineapples"}');
    const rows = await until(async () => {
      const r = await allRows(stub);
      return hasRow(r, "assistant", "TOOL RESULT") && r;
    });
    const tool = rows.find((r) => r.role === "tool")!;
    expect(tool.text).toContain("search_history(query=pineapples)");
    expect(tool.text).toContain("pineapples"); // the search found the earlier message
  });

  it("records runs in the registry (D14)", async () => {
    const { cfg, stub } = await makeBot();
    await stub.ingest("chat", "hi");
    await until(async () => hasRow(await allRows(stub), "assistant", "ECHO"));
    const run = await until(async () => {
      const r = await testEnv.DB.prepare(`SELECT * FROM runs WHERE bot_id = ?1`).bind(cfg.id).first();
      return r?.status === "done" ? r : false;
    });
    expect(run.source).toBe("chat");
    const bot = await testEnv.DB.prepare(`SELECT last_text FROM bots WHERE id = ?1`).bind(cfg.id).first();
    expect(bot.last_text).toContain("ECHO: hi");
  });

  it("counts unread replies when nobody is connected (D18)", async () => {
    const { cfg, stub } = await makeBot();
    await stub.ingest("chat", "hi");
    await until(async () => hasRow(await allRows(stub), "assistant", "ECHO"));
    const bot = await until(async () => {
      const b = await testEnv.DB.prepare(`SELECT unread FROM bots WHERE id = ?1`).bind(cfg.id).first();
      return b.unread > 0 && b;
    });
    expect(bot.unread).toBe(1);
  });
});

describe("one long thread (D15, D16, D17)", () => {
  it("resets the Pi context but keeps the full thread, and search still finds old turns", async () => {
    const { stub } = await makeBot();
    await stub.ingest("chat", "remember my cat is called Biscuit");
    await until(async () => hasRow(await allRows(stub), "assistant", "ECHO: remember"));
    await stub.ingest("chat", "and I like green tea");
    await until(async () => hasRow(await allRows(stub), "assistant", "ECHO: and I like"));
    const before = await stub.debugContext();
    expect(before.entries).toBeGreaterThan(3);

    await stub.resetContext();
    const after = await stub.debugContext();
    expect(after.entries).toBe(1); // only the handoff note

    // The display thread is not touched.
    const rows = await allRows(stub);
    expect(rows.filter((r) => r.role === "user")).toHaveLength(2);

    // The thread keeps going after a reset, and old turns are searchable (BM25).
    await stub.ingest("chat", "what is my cat called?");
    await until(async () => hasRow(await allRows(stub), "assistant", "ECHO: what is my cat"));
    const hits = (await stub.search("Biscuit cat")) as any[];
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].snippet).toContain("Biscuit");
  });

  it("starts a fresh context automatically after a long idle gap", async () => {
    const { stub } = await makeBot();
    await stub.ingest("chat", "one");
    await until(async () => hasRow(await allRows(stub), "assistant", "ECHO: one"));
    await stub.debugSetLastActivity(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago
    await stub.ingest("chat", "two");
    await until(async () => hasRow(await allRows(stub), "assistant", "ECHO: two"));
    const ctx = await stub.debugContext();
    // handoff + "two" + answer. The first exchange is gone from the Pi context.
    expect(ctx.entries).toBeLessThanOrEqual(5);
    expect((await allRows(stub)).filter((r) => r.role === "user")).toHaveLength(2);
  });
});

describe("settings by chat (D26, D27, D28)", () => {
  it("changes settings, posts an undo card, and undoes", async () => {
    const { stub } = await makeBot();
    await stub.configure({ persona: "Be brief.", name: "Briefly" });
    let cfg = await stub.getConfig();
    expect(cfg.persona).toBe("Be brief.");
    expect(cfg.name).toBe("Briefly");
    const rows = await allRows(stub);
    const card = rows.find((r) => r.meta?.change && r.text.startsWith("Name"))!;
    expect(card.meta!.change!.before).toEqual({ name: "Tester" });

    await stub.undoChange(card.id);
    cfg = await stub.getConfig();
    expect(cfg.name).toBe("Tester");
    expect(cfg.persona).toBe("Be brief."); // only the name was undone
    const updated = (await allRows(stub)).find((r) => r.id === card.id)!;
    expect(updated.meta!.change!.undone).toBe(true);
  });

  it("adds a schedule from a cron expression and arms an alarm (D31)", async () => {
    const { stub } = await makeBot();
    const report = await stub.configure({
      add_schedule: { text: "weekdays at 8am", cron: "0 8 * * 1-5", prompt: "Summarize my day" },
    });
    expect(report.ok).toBe(true);
    expect(report.message).toContain("weekdays at 8am");
    const cfg = await stub.getConfig();
    expect(cfg.schedules).toHaveLength(1);
    expect((await stub.debugContext()).alarms).toBe(1);

    await stub.configure({ remove_schedule: cfg.schedules[0]!.id });
    expect((await stub.getConfig()).schedules).toHaveLength(0);
    expect((await stub.debugContext()).alarms).toBe(0);
  });

  it("refuses a bad cron expression", async () => {
    const { stub } = await makeBot();
    const r = await stub.configure({ add_schedule: { text: "x", cron: "every day", prompt: "p" } });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("five-field");
    expect((await stub.getConfig()).schedules).toHaveLength(0);
  });

  it("changes toolkits and the model", async () => {
    const { stub, cfg } = await makeBot();
    await stub.configure({ toolkits: ["Gmail", "gmail", "todoist"], model: "faux-1" });
    expect((await stub.getConfig()).toolkits).toEqual(["gmail", "todoist"]);
    const row = await testEnv.DB.prepare(`SELECT toolkits FROM bots WHERE id = ?1`).bind(cfg.id).first();
    expect(JSON.parse(row.toolkits)).toEqual(["gmail", "todoist"]);
  });
});

describe("proactive runs (D4, D11, D18)", () => {
  it("runs a schedule into the same thread with a label", async () => {
    const { cfg, stub } = await makeBot();
    await stub.configure({ add_schedule: { text: "daily", cron: "0 8 * * *", prompt: "Give the daily brief" } });
    const sch = (await stub.getConfig()).schedules[0]!;
    await stub.runSchedule({ id: sch.id });
    const rows = await until(async () => {
      const r = await allRows(stub);
      return hasRow(r, "assistant", "ECHO: Give the daily brief") && r;
    });
    const input = rows.find((r) => r.role === "user")!;
    expect(input.label).toBe("schedule: daily");
    expect(input.text).toBe("Give the daily brief");
    const run = await until(async () => {
      const r = await testEnv.DB.prepare(`SELECT * FROM runs WHERE bot_id = ?1 AND source = 'schedule'`).bind(cfg.id).first();
      return r?.status === "done" ? r : false;
    });
    expect(run.label).toBe("schedule: daily");
    expect((await stub.debugContext()).alarms).toBe(1); // armed again for the next run
  });

  it("runs a trigger event with the event data marked as untrusted", async () => {
    const { stub } = await makeBot({
      triggers: [{ id: "trg-1", slug: "GMAIL_NEW_GMAIL_MESSAGE", config: {}, prompt: "Tell me about the new email" }],
    });
    await stub.handleTrigger({ triggerId: "trg-1", slug: "GMAIL_NEW_GMAIL_MESSAGE", data: { subject: "Hi" } });
    const rows = await until(async () => {
      const r = await allRows(stub);
      return hasRow(r, "assistant", "ECHO") && r;
    });
    const input = rows.find((r) => r.role === "user")!;
    expect(input.label).toBe("trigger: GMAIL_NEW_GMAIL_MESSAGE");
    expect(input.text).toContain("Event data (untrusted)");
    expect(input.text).toContain('"subject":"Hi"');
  });
});

describe("memory (D10)", () => {
  it("keeps a memory document for the bot and a shared one", async () => {
    const { stub } = await makeBot();
    await stub.writeMemory("bot", "Prefers short answers.");
    await stub.writeMemory("shared", "The owner lives in Barcelona.");
    expect(await stub.readMemory("bot")).toBe("Prefers short answers.");
    expect(await stub.readMemory("shared")).toBe("The owner lives in Barcelona.");
    const other = await makeBot();
    expect(await other.stub.readMemory("bot")).toBe("");
    expect(await other.stub.readMemory("shared")).toBe("The owner lives in Barcelona.");
  });
});

describe("Builder (D21)", () => {
  it("creates a bot from chat and deletes it again, with all storage", async () => {
    const { stub } = await makeBot({ id: "builder", kind: "builder", name: "Builder" });
    await stub.ingest("chat", 'TOOL:create_bot:{"name":"Inbox","emoji":"📧","persona":"Triage mail.","toolkits":["gmail"]}');
    await until(async () => hasRow(await allRows(stub), "assistant", "TOOL RESULT: Created bot"));
    const created = await testEnv.DB.prepare(`SELECT * FROM bots WHERE name = 'Inbox'`).first();
    expect(created).toBeTruthy();
    expect(created.kind).toBe("bot");
    expect(JSON.parse(created.toolkits)).toEqual(["gmail"]);

    // The new bot works.
    const bot = await getAgentByName(testEnv.BotAgent, created.id);
    expect((await bot.getConfig()).persona).toBe("Triage mail.");
    await bot.ingest("chat", "hi");
    await until(async () => hasRow(await allRows(bot), "assistant", "ECHO: hi"));
    await testEnv.FILES.put(`bots/${created.id}/avatar.png`, "x");

    // Delete it from chat.
    await stub.ingest("chat", `TOOL:delete_bot:{"id":"${created.id}"}`);
    await until(async () => hasRow(await allRows(stub), "assistant", "TOOL RESULT: Deleted bot"));
    expect(await testEnv.DB.prepare(`SELECT id FROM bots WHERE id = ?1`).bind(created.id).first()).toBeNull();
    expect(await testEnv.DB.prepare(`SELECT id FROM runs WHERE bot_id = ?1`).bind(created.id).first()).toBeNull();
    expect((await testEnv.FILES.list({ prefix: `bots/${created.id}/` })).objects).toHaveLength(0);
  });

  it("does not let Builder delete itself", async () => {
    const { stub } = await makeBot({ id: "builder", kind: "builder", name: "Builder" });
    await stub.ingest("chat", 'TOOL:delete_bot:{"id":"builder"}');
    await until(async () => hasRow(await allRows(stub), "assistant", "Builder cannot be deleted"));
  });
});
