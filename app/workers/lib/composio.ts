import { Composio } from "@composio/core";
import { Type } from "@earendil-works/pi-ai";
import type { ToolRegistration } from "@earendil-works/pi-durable";
import { OWNER_ID, type AppEnv } from "./env";

/** The Tool Router meta tools a bot gets (D20). The remote bash and workbench tools are left out. */
export const META_TOOLS = [
  "COMPOSIO_SEARCH_TOOLS",
  "COMPOSIO_GET_TOOL_SCHEMAS",
  "COMPOSIO_MULTI_EXECUTE_TOOL",
  "COMPOSIO_MANAGE_CONNECTIONS",
];
const SAFE = new Set(["COMPOSIO_SEARCH_TOOLS", "COMPOSIO_GET_TOOL_SCHEMAS"]);

/** Toolkits that the Connections page always lists (D24). */
export const POPULAR_TOOLKITS = [
  "gmail",
  "googlecalendar",
  "todoist",
  "github",
  "slack",
  "notion",
  "googledrive",
  "googlesheets",
  "linear",
  "outlook",
];

type Session = Awaited<ReturnType<Composio["create"]>>;

const clients = new Map<string, Composio>();
const sessions = new Map<string, Promise<Session>>();

export function composioClient(env: AppEnv): Composio {
  let c = clients.get(env.COMPOSIO_API_KEY);
  if (!c) {
    c = new Composio({ apiKey: env.COMPOSIO_API_KEY });
    clients.set(env.COMPOSIO_API_KEY, c);
  }
  return c;
}

/** One Tool Router session for the owner, limited to these toolkits (D25). */
export function getSession(env: AppEnv, toolkits: string[]): Promise<Session> {
  const key = [...toolkits].sort().join(",");
  let s = sessions.get(key);
  if (!s) {
    s = composioClient(env).create(OWNER_ID, { toolkits });
    s.catch(() => sessions.delete(key));
    sessions.set(key, s);
  }
  return s;
}

export interface MetaSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Fetch the meta tool schemas. They are the same for every toolkit list. */
export async function loadMetaSchemas(env: AppEnv, toolkits: string[]): Promise<MetaSchema[]> {
  const session = await getSession(env, toolkits.length ? toolkits : ["gmail"]);
  const tools: any[] = await session.tools();
  return tools
    .filter((t) => META_TOOLS.includes(t.function.name))
    .map((t) => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters }));
}

export function metaToolRegistrations(
  env: AppEnv,
  schemas: MetaSchema[],
  currentToolkits: () => string[],
): ToolRegistration<any>[] {
  return schemas.map((s) => ({
    name: s.name,
    description: s.description,
    parameters: Type.Unsafe(s.parameters) as any,
    replay: SAFE.has(s.name) ? "safe" : "unsafe",
    execute: async (args: unknown) => {
      const toolkits = currentToolkits();
      if (toolkits.length === 0) {
        return {
          isError: true,
          output: [{ type: "text", text: "No toolkits are enabled for this bot. Use configure_self to add one, for example gmail." }],
        };
      }
      try {
        const session = await getSession(env, toolkits);
        const res = await (session as any).executeMeta(s.name, args);
        return { output: [{ type: "text", text: JSON.stringify(res).slice(0, 8000) }] };
      } catch (e) {
        return { isError: true, output: [{ type: "text", text: `Composio error: ${(e as Error).message}` }] };
      }
    },
  }));
}

export interface ToolkitStatus {
  slug: string;
  name: string;
  logo?: string;
  connected: boolean;
}

export async function toolkitStatuses(env: AppEnv, slugs: string[]): Promise<ToolkitStatus[]> {
  const session = await getSession(env, slugs);
  const res = await session.toolkits();
  return res.items.map((i) => ({
    slug: i.slug,
    name: i.name,
    logo: i.logo,
    connected: !!i.connection?.isActive || i.isNoAuth,
  }));
}

/** A link that connects one toolkit (D24). */
export async function connectLink(env: AppEnv, slug: string, callbackUrl?: string): Promise<string | undefined> {
  const session = await getSession(env, [slug]);
  const req: any = await session.authorize(slug, callbackUrl ? { callbackUrl } : undefined);
  return req.redirectUrl ?? req.redirect_url;
}
