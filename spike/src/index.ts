import { Type } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { createRegistry, Harness, type ToolRegistration } from "@earendil-works/pi-durable";
import { Composio } from "@composio/core";
import { Agent, routeAgentRequest } from "agents";
import { PiHarness } from "agents/harness/pi";

// D12: send OpenRouter traffic through AI Gateway by changing the base URL and adding the gateway token.
function gatewayProvider(env: Env) {
  const base = openrouterProvider();
  if (!env.GATEWAY_BASE) return base;
  return {
    ...base,
    getModels: () =>
      base.getModels().map((m) => ({
        ...m,
        baseUrl: env.GATEWAY_BASE,
        headers: { ...(m as any).headers, "cf-aig-authorization": `Bearer ${env.CF_AIG_TOKEN}` },
      })),
  } as typeof base;
}
const FREE_ID = "nvidia/nemotron-3-super-120b-a12b:free";

const Echo = Type.Object({ text: Type.String() });
const echo: ToolRegistration<typeof Echo> = {
  name: "echo",
  description: "Return the text that you give it, in upper case.",
  parameters: Echo,
  replay: "safe",
  async execute({ text }) {
    return { output: [{ type: "text", text: text.toUpperCase() }] };
  },
};

// Point 4: a JSON Schema that did not come from TypeBox, as a Composio tool would give it.
const fetchEmailsSchema = {
  type: "object",
  required: ["query"],
  properties: {
    query: { type: "string", description: "Gmail search query" },
    max_results: { type: "integer", description: "How many emails", default: 5 },
  },
} as const;
const fetchEmails: ToolRegistration<any> = {
  name: "GMAIL_FETCH_EMAILS",
  description: "Search Gmail. Returns a list of emails (fake data in this spike).",
  parameters: Type.Unsafe(fetchEmailsSchema) as any,
  replay: "safe",
  async execute(args: { query: string; max_results?: number }) {
    return { output: [{ type: "text", text: `FAKE: 2 emails for "${args.query}" (max ${args.max_results ?? 5})` }] };
  },
};

// Point 6: a slow tool, so the run is still going when the process stops.
const Slow = Type.Object({});
const slow: ToolRegistration<typeof Slow> = {
  name: "slow",
  description: "Wait 25 seconds, then return DONE.",
  parameters: Slow,
  replay: "safe",
  async execute() {
    await new Promise((r) => setTimeout(r, 25_000));
    return { output: [{ type: "text", text: "DONE" }] };
  },
};

export class Spike extends Agent<Env> {
  registry = createRegistry();
  harness = new PiHarness({
    harness: ({ storage, context }) => {
      const models = createModels();
      models.setProvider(gatewayProvider(this.env));
      this.registry.install({ name: "spike", sections: [], tools: [echo, fetchEmails, slow] });
      return Harness.open(storage, { models, registry: this.registry }, context);
    },
    defaults: { model: gatewayProvider(this.env).getModels().find((m) => m.id === FREE_ID)!, thinkingLevel: "off" },
  });

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.lifecycle.use(this.harness);
  }

  async ask(q: string) {
    const r = await this.harness.prompt(q);
    return { text: r.text, status: r.status };
  }

  async submitOnly(q: string, id: string): Promise<unknown> {
    const r = await this.harness.session().submit(q, { operationId: id });
    return JSON.parse(JSON.stringify(r));
  }

  async waitFor(id: string): Promise<unknown> {
    const r = await this.harness.session().wait(id);
    return JSON.parse(JSON.stringify(r));
  }

  // Point 5: Composio Tool Router session, with its meta tools registered as Pi tools.
  composioSession?: Awaited<ReturnType<Composio["create"]>>;
  async composio() {
    if (!this.composioSession) {
      const c = new Composio({ apiKey: this.env.COMPOSIO_API_KEY });
      this.composioSession = await c.create("owner", { toolkits: ["gmail"] });
    }
    return this.composioSession;
  }

  async composioInfo(): Promise<unknown> {
    const session = await this.composio();
    const tools = await session.tools();
    const req = await session.authorize("gmail");
    return JSON.parse(
      JSON.stringify({
        tools: tools.map((t: any) => t.function.name),
        toolkits: await session.toolkits(),
        connect: { hasRedirectUrl: !!(req as any).redirectUrl },
      }),
    );
  }

  async composioInstall() {
    const session = await this.composio();
    const tools: any[] = await session.tools();
    const keep = tools.filter((t) => ["COMPOSIO_SEARCH_TOOLS", "COMPOSIO_GET_TOOL_SCHEMAS", "COMPOSIO_MULTI_EXECUTE_TOOL", "COMPOSIO_MANAGE_CONNECTIONS"].includes(t.function.name));
    const regs: ToolRegistration<any>[] = keep.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: Type.Unsafe(t.function.parameters) as any,
      replay: t.function.name === "COMPOSIO_SEARCH_TOOLS" || t.function.name === "COMPOSIO_GET_TOOL_SCHEMAS" ? "safe" : "unsafe",
      execute: async (args: any) => {
        const res = await (session as any).executeMeta(t.function.name, args);
        return { output: [{ type: "text", text: JSON.stringify(res).slice(0, 6000) }] };
      },
    }));
    this.registry.install({ name: "composio", sections: [], tools: regs });
    return regs.map((r) => r.name);
  }

  async msgs() {
    return (await this.harness.session().messages()).length;
  }

  async dump() {
    const m = await this.harness.session().messages();
    return JSON.parse(JSON.stringify(m)) as unknown[];
  }

  async reset(note: string) {
    const session = this.harness.session();
    await session.reset(note);
    return (await session.messages()).length;
  }

  async snapshot(): Promise<unknown> {
    const stream = await this.harness.session().events();
    const snap = JSON.parse(JSON.stringify(stream.snapshot));
    await stream.stop();
    return snap;
  }
}

interface Env {
  SPIKE: DurableObjectNamespace<Spike>;
  AI: Ai;
  OPENROUTER_API_KEY: string;
  COMPOSIO_API_KEY: string;
  GATEWAY_BASE: string;
  CF_AIG_TOKEN: string;
}

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    const stub = env.SPIKE.get(env.SPIKE.idFromName("one"));
    if (url.pathname === "/ask") return Response.json(await stub.ask(url.searchParams.get("q") ?? "hi"));
    if (url.pathname === "/dump") return Response.json(await stub.dump());
    if (url.pathname === "/reset") return Response.json({ after: await stub.reset(url.searchParams.get("note") ?? "") });
    if (url.pathname === "/snapshot") return Response.json(await stub.snapshot());
    if (url.pathname === "/submit") return Response.json(await stub.submitOnly(url.searchParams.get("q") ?? "hi", url.searchParams.get("id") ?? "op1"));
    if (url.pathname === "/wait") return Response.json(await stub.waitFor(url.searchParams.get("id") ?? "op1"));
    if (url.pathname === "/composio") return Response.json(await stub.composioInfo());
    if (url.pathname === "/composio-install") return Response.json(await stub.composioInstall());
    if (url.pathname === "/count") return Response.json({ messages: await stub.msgs() });
    return (await routeAgentRequest(req, env)) ?? new Response("spike");
  },
};
