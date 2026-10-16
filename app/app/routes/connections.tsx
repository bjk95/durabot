import { Form, Link, redirect, useNavigation } from "react-router";
import { cloudflareContext } from "../../workers/lib/context";
import { connectLink, POPULAR_TOOLKITS, toolkitStatuses } from "../../workers/lib/composio";
import { listBots } from "../../workers/lib/registry";
import { Badge, Button, Card } from "../components/ui";
import type { Route } from "./+types/connections";

export async function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const used = new Map<string, string[]>();
  for (const b of await listBots(env)) {
    const row = await env.DB.prepare(`SELECT toolkits FROM bots WHERE id = ?1`).bind(b.id).first<{ toolkits: string }>();
    for (const tk of JSON.parse(row?.toolkits ?? "[]") as string[]) used.set(tk, [...(used.get(tk) ?? []), b.name]);
  }
  const slugs = [...new Set([...POPULAR_TOOLKITS, ...used.keys()])];
  try {
    const toolkits = await toolkitStatuses(env, slugs);
    return { toolkits, used: Object.fromEntries(used), error: null as string | null };
  } catch (e) {
    return { toolkits: [], used: Object.fromEntries(used), error: (e as Error).message };
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  const { env } = context.get(cloudflareContext);
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");
  if (!slug) return { error: "Missing app" };
  try {
    const url = await connectLink(env, slug, new URL("/connections", request.url).toString());
    if (url) return redirect(url);
    return { error: "Composio gave no link" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export default function Connections({ loaderData, actionData }: Route.ComponentProps) {
  const { toolkits, used, error } = loaderData;
  const nav = useNavigation();
  const msg = error ?? (actionData as any)?.error;
  return (
    <main className="mx-auto max-w-2xl px-4 pb-10 pt-6">
      <header className="mb-5 flex items-center gap-3">
        <Link to="/" className="text-lg text-muted">
          ‹
        </Link>
        <h1 className="text-xl font-semibold">Connections</h1>
      </header>
      <p className="mb-4 text-sm text-muted">
        You connect each app one time. Then you choose in each bot which apps it can use. Sign-in runs on Composio; durabot never sees your tokens.
      </p>
      {msg && <p className="mb-4 rounded-lg border border-danger p-3 text-sm text-danger">{msg}</p>}
      <div className="space-y-2">
        {toolkits.map((t) => (
          <Card key={t.slug} className="flex items-center gap-3 py-3">
            {t.logo ? <img src={t.logo} alt="" className="h-8 w-8 rounded" /> : <div className="h-8 w-8 rounded bg-surface-2" />}
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t.name}</div>
              <div className="truncate text-xs text-muted">
                {used[t.slug]?.length ? `Used by ${used[t.slug]!.join(", ")}` : t.slug}
              </div>
            </div>
            {t.connected ? (
              <Badge tone="accent">Connected</Badge>
            ) : (
              <Form method="post">
                <input type="hidden" name="slug" value={t.slug} />
                <Button variant="outline" disabled={nav.state !== "idle"}>
                  Connect
                </Button>
              </Form>
            )}
          </Card>
        ))}
      </div>
    </main>
  );
}
