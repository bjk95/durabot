// Smoke test: talk to a bot over the WebSocket protocol (D22).
// Usage: node scripts/ws-smoke.mjs <botId> "<message>" [baseUrl]
const [botId = "builder", text = "Say hello in five words.", base = "ws://localhost:5173"] = process.argv.slice(2);
const ws = new WebSocket(`${base}/agents/bot-agent/${botId}`);
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
let sent = false;
let seenAssistant = false;
let running = false;
let lastEvent = Date.now();
// Done when a reply arrived and the run has been idle for a while.
setInterval(() => { if (seenAssistant && !running && Date.now() - lastEvent > 6000) { ws.close(); process.exit(0); } }, 1000);
ws.onmessage = (e) => {
  let m;
  try { m = JSON.parse(e.data); } catch { return; }
  lastEvent = Date.now();
  if (m.type === "live") running = m.live.running;
  if (m.type === "history") {
    log("history rows:", m.rows.length, "config:", m.config?.name, m.config?.model);
    if (!sent) { sent = true; ws.send(JSON.stringify({ type: "send", id: crypto.randomUUID(), text })); log("sent:", text); }
  } else if (m.type === "log_append") {
    for (const r of m.rows) log(`row #${r.id} [${r.role}${r.label ? " " + r.label : ""}]`, r.text.slice(0, 160));
    seenAssistant ||= m.rows.some((r) => r.role === "assistant");
  } else if (m.type === "live" && m.live.running) {
    log("live:", JSON.stringify(m.live).slice(0, 120));
  } else if (m.type === "config") log("config update");
};
ws.onerror = (e) => { log("ws error", e.message ?? ""); process.exit(1); };
setTimeout(() => { log("timeout"); process.exit(2); }, 280000);
