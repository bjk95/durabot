import { Check, TriangleAlert } from "lucide-react";
import { Form, redirect, useNavigation, useRevalidator } from "react-router";
import { cloudflareContext } from "../../workers/lib/context";
import { connectLink, POPULAR_TOOLKITS, toolkitStatuses } from "../../workers/lib/composio";
import { listBots } from "../../workers/lib/registry";
import { LargeTitleScreen, LogoTile, Section } from "../components/ui";
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
    return { error: "Composio gave no link." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export default function Connections({ loaderData, actionData }: Route.ComponentProps) {
  const { toolkits, used, error } = loaderData;
  const nav = useNavigation();
  const revalidator = useRevalidator();
  const msg = error ? "Could not reach Composio. Check your connection." : (actionData as any)?.error;
  const loading = revalidator.state === "loading";

  return (
    <LargeTitleScreen title="Connections" back>
      <div className="note-card">
        <LinkGlyph />
        <span>You connect each app one time. Then you choose in each bot which apps it can use. Sign-in runs on Composio; durabot never sees your tokens.</span>
      </div>
      {msg && (
        <div className="banner" role="alert">
          <TriangleAlert className="i" width={20} height={20} strokeWidth={1.8} />
          <span>{msg}</span>
          {error && (
            <button type="button" className="btn" onClick={() => revalidator.revalidate()}>
              Retry
            </button>
          )}
        </div>
      )}
      <Section>
        <div className="group">
          {loading &&
            [0, 1, 2].map((i) => (
              <div className="frow" key={i} style={{ minHeight: 68 }}>
                <span className="logo skel" style={{ height: 44 }} />
                <span className="skel" style={{ flex: 1, maxWidth: 160 }} />
              </div>
            ))}
          {!loading &&
            toolkits.map((t) => (
              <div className="frow" key={t.slug} style={{ minHeight: 68 }}>
                <LogoTile src={t.logo} name={t.name} />
                <div className="v">
                  <b>{t.name}</b>
                  <div style={{ font: "400 13px/18px var(--font-sans)", color: "var(--muted)" }}>
                    {used[t.slug]?.length ? `Used by ${used[t.slug]!.join(", ")}` : "Not used yet"}
                  </div>
                </div>
                {t.connected ? (
                  <span className="badge badge-ok">
                    <Check className="i" width={13} height={13} strokeWidth={2.4} />
                    Connected
                  </span>
                ) : (
                  <Form method="post">
                    <input type="hidden" name="slug" value={t.slug} />
                    <button className="btn btn-primary btn-sm" disabled={nav.state !== "idle"} aria-label={`Connect ${t.name}`}>
                      Connect
                    </button>
                  </Form>
                )}
              </div>
            ))}
        </div>
      </Section>
    </LargeTitleScreen>
  );
}

function LinkGlyph() {
  return (
    <svg className="i" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}
