import { createModels, type MutableModels } from "@earendil-works/pi-ai/models";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import type { AppEnv } from "./env";

type AnyModel = ReturnType<ReturnType<typeof openrouterProvider>["getModels"]>[number];

function textOfMessage(m: any): string {
  const c = m?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((p: any) => (p?.type === "text" ? p.text : "")).join("");
  return "";
}

/** A scripted model for tests: echoes text, or calls a tool when asked with `TOOL:name:{json}`. */
function createFaux() {
  const faux = fauxProvider();
  const respond = (ctx: any) => {
    // Several bots can call the one scripted model at the same time, so keep the queue full.
    if (faux.getPendingResponseCount() < 16) faux.appendResponses(Array.from({ length: 16 }, () => respond));
    const messages: any[] = ctx.messages ?? [];
    const last = messages[messages.length - 1];
    if (last?.role === "toolResult") return fauxAssistantMessage(`TOOL RESULT: ${textOfMessage(last)}`);
    const text = textOfMessage(last).replace(/^\[\[from:[^\]]*\]\]\n/, "");
    const call = text.match(/TOOL:(\w+):(\{.*\})/s);
    if (call) return fauxAssistantMessage(fauxToolCall(call[1]!, JSON.parse(call[2]!)), { stopReason: "toolUse" });
    if (text.includes("Summarize this conversation")) return fauxAssistantMessage("SUMMARY: they talked about things");
    return fauxAssistantMessage(`ECHO: ${text}`);
  };
  faux.setResponses(Array.from({ length: 16 }, () => respond));
  return faux;
}

let fauxHandle: ReturnType<typeof createFaux> | undefined;

/** The Pi `Provider` for this environment: AI Gateway for OpenRouter (D12), or the test model. */
export function buildProvider(env: AppEnv): { provider: any; models: () => readonly AnyModel[] } {
  if (env.MODEL_BACKEND === "faux") {
    fauxHandle ??= createFaux();
    const h = fauxHandle;
    return { provider: h.provider, models: () => h.models as unknown as AnyModel[] };
  }
  const base = openrouterProvider();
  if (!env.GATEWAY_BASE || !env.CF_AIG_TOKEN) return { provider: base, models: () => base.getModels() };
  const wrap = (m: AnyModel): AnyModel =>
    ({
      ...m,
      baseUrl: env.GATEWAY_BASE!,
      headers: { ...(m as any).headers, "cf-aig-authorization": `Bearer ${env.CF_AIG_TOKEN}` },
    }) as AnyModel;
  const provider = { ...base, getModels: () => base.getModels().map(wrap) } as typeof base;
  return { provider, models: () => provider.getModels() };
}

/**
 * Find a model by id. An OpenRouter id that is not in the catalog gets default limits,
 * so each bot can pick any model (D7).
 */
export function modelById(env: AppEnv, id: string): AnyModel {
  const { models } = buildProvider(env);
  const list = models();
  if (env.MODEL_BACKEND === "faux") return list[0]!;
  const found = list.find((m) => m.id === id);
  if (found) return found;
  const t = list.find((m) => m.id === env.DEFAULT_MODEL) ?? list[0]!;
  return { ...t, id, name: id, contextWindow: 128_000 } as AnyModel;
}

export function newModels(env: AppEnv): MutableModels {
  const m = createModels();
  m.setProvider(buildProvider(env).provider);
  return m;
}
