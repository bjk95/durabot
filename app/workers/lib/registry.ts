import type { BotConfig, BotListItem, RunRow } from "../../app/lib/protocol";
import type { AppEnv } from "./env";

/** D1 registry (D32). Writes are best effort: a failure must not break a run. */

export async function upsertBot(env: AppEnv, c: BotConfig): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO bots (id, name, emoji, kind, persona, model, toolkits, schedules, triggers, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
     ON CONFLICT(id) DO UPDATE SET name = ?2, emoji = ?3, kind = ?4, persona = ?5, model = ?6,
       toolkits = ?7, schedules = ?8, triggers = ?9`,
  )
    .bind(c.id, c.name, c.emoji, c.kind, c.persona, c.model, JSON.stringify(c.toolkits), JSON.stringify(c.schedules), JSON.stringify(c.triggers), Date.now())
    .run();
}

export async function listBots(env: AppEnv): Promise<BotListItem[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, emoji, kind, unread, last_text, last_at FROM bots
     ORDER BY (kind = 'builder') DESC, last_at DESC, created_at DESC`,
  ).all<BotListItem>();
  return results;
}

export async function getBot(env: AppEnv, id: string): Promise<BotConfig | null> {
  const r = await env.DB.prepare(`SELECT * FROM bots WHERE id = ?1`).bind(id).first<any>();
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    kind: r.kind,
    persona: r.persona,
    model: r.model,
    toolkits: JSON.parse(r.toolkits),
    schedules: JSON.parse(r.schedules),
    triggers: JSON.parse(r.triggers),
  };
}

export async function deleteBotRows(env: AppEnv, id: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM bots WHERE id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM runs WHERE bot_id = ?1`).bind(id),
    env.DB.prepare(`DELETE FROM triggers WHERE bot_id = ?1`).bind(id),
  ]);
}

export async function touchBot(env: AppEnv, id: string, text: string, unreadDelta: number): Promise<void> {
  await env.DB.prepare(`UPDATE bots SET last_text = ?2, last_at = ?3, unread = unread + ?4 WHERE id = ?1`)
    .bind(id, text.slice(0, 160), Date.now(), unreadDelta)
    .run();
}

export async function markRead(env: AppEnv, id: string): Promise<void> {
  await env.DB.prepare(`UPDATE bots SET unread = 0 WHERE id = ?1`).bind(id).run();
}

export async function startRun(env: AppEnv, r: { id: string; botId: string; source: string; label?: string | null }) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO runs (id, bot_id, source, label, status, started_at) VALUES (?1, ?2, ?3, ?4, 'running', ?5)`,
  )
    .bind(r.id, r.botId, r.source, r.label ?? null, Date.now())
    .run();
}

export async function finishRun(
  env: AppEnv,
  id: string,
  r: { status: RunRow["status"]; tools: string[]; cost: number },
) {
  await env.DB.prepare(`UPDATE runs SET status = ?2, tools = ?3, cost = ?4, finished_at = ?5 WHERE id = ?1`)
    .bind(id, r.status, JSON.stringify(r.tools), r.cost, Date.now())
    .run();
}

export async function runningRuns(env: AppEnv, botId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(`SELECT id FROM runs WHERE bot_id = ?1 AND status = 'running'`)
    .bind(botId)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

export async function listRuns(env: AppEnv, botId: string, limit = 30): Promise<RunRow[]> {
  const { results } = await env.DB.prepare(`SELECT * FROM runs WHERE bot_id = ?1 ORDER BY started_at DESC LIMIT ?2`)
    .bind(botId, limit)
    .all<RunRow>();
  return results;
}

export async function getSetting(env: AppEnv, key: string): Promise<string | null> {
  const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first<{ value: string }>();
  return r?.value ?? null;
}

export async function setSetting(env: AppEnv, key: string, value: string): Promise<void> {
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2`)
    .bind(key, value)
    .run();
}

export async function timezone(env: AppEnv): Promise<string> {
  return (await getSetting(env, "timezone")) ?? env.OWNER_TIMEZONE ?? "UTC";
}

export async function savePushSub(env: AppEnv, sub: { endpoint: string }): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, subscription, created_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(endpoint) DO UPDATE SET subscription = ?2`,
  )
    .bind(sub.endpoint, JSON.stringify(sub), Date.now())
    .run();
}

export async function listPushSubs(env: AppEnv): Promise<any[]> {
  const { results } = await env.DB.prepare(`SELECT subscription FROM push_subscriptions`).all<{ subscription: string }>();
  return results.map((r) => JSON.parse(r.subscription));
}

export async function deletePushSub(env: AppEnv, endpoint: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?1`).bind(endpoint).run();
}

export async function saveTrigger(env: AppEnv, t: { triggerId: string; botId: string; slug: string; prompt: string }) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO triggers (trigger_id, bot_id, slug, prompt, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(t.triggerId, t.botId, t.slug, t.prompt, Date.now())
    .run();
}

export async function findTrigger(env: AppEnv, triggerId: string) {
  return env.DB.prepare(`SELECT * FROM triggers WHERE trigger_id = ?1`).bind(triggerId).first<{
    trigger_id: string;
    bot_id: string;
    slug: string;
    prompt: string;
  }>();
}

export async function deleteTrigger(env: AppEnv, triggerId: string) {
  await env.DB.prepare(`DELETE FROM triggers WHERE trigger_id = ?1`).bind(triggerId).run();
}
