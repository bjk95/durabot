import { useEffect } from "react";
import { Link, useRevalidator } from "react-router";
import { cloudflareContext } from "../../workers/lib/context";
import { ensureBuilder } from "../../workers/lib/builder";
import { listBots } from "../../workers/lib/registry";
import { Badge, timeAgo } from "../components/ui";
import type { Route } from "./+types/home";

export async function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await ensureBuilder(env);
  return { bots: await listBots(env) };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { bots } = loaderData;
  const revalidator = useRevalidator();
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && revalidator.revalidate(), 15000);
    return () => clearInterval(t);
  }, [revalidator]);

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col px-4 pb-10 pt-6">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">durabot</h1>
        <nav className="flex gap-4 text-sm text-muted">
          <Link to="/connections" className="hover:text-ink">
            Connections
          </Link>
          <Link to="/settings" className="hover:text-ink">
            Settings
          </Link>
        </nav>
      </header>

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {bots.map((b) => (
          <li key={b.id}>
            <Link to={`/bots/${b.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-2xl">
                {b.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{b.name}</span>
                  <span className="shrink-0 text-xs text-muted">{timeAgo(b.last_at)}</span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-muted">
                    {b.last_text || (b.kind === "builder" ? "Describe a bot to create it" : "No messages yet")}
                  </span>
                  {b.unread > 0 && <Badge tone="accent">{b.unread}</Badge>}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {bots.length <= 1 && (
        <p className="mt-4 text-sm text-muted">
          Open Builder and say what you want, for example: "Make a bot that triages my Gmail every morning."
        </p>
      )}
    </main>
  );
}
