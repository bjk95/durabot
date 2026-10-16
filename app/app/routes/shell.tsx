import { useEffect } from "react";
import { NavLink, Outlet, useRevalidator } from "react-router";
import { ensureBuilder } from "../../workers/lib/builder";
import { cloudflareContext } from "../../workers/lib/context";
import { listBots } from "../../workers/lib/registry";
import { Avatar, NavButtons } from "../components/ui";
import { listTime } from "../lib/format";
import type { Route } from "./+types/shell";

export async function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  await ensureBuilder(env);
  return { bots: await listBots(env) };
}

/** The frame of every screen: a floating glass sidebar on a wide window, one column on a phone. */
export default function Shell({ loaderData }: Route.ComponentProps) {
  const { bots } = loaderData;
  const revalidator = useRevalidator();
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && revalidator.revalidate(), 15000);
    return () => clearInterval(t);
  }, [revalidator]);

  return (
    <div className="shell">
      <aside className="side glass" aria-label="Bots">
        <div className="side-head">
          <span>durabot</span>
          <NavButtons />
        </div>
        <nav className="list">
          {bots.map((b) => (
            <NavLink key={b.id} to={`/bots/${b.id}`} className={({ isActive }) => `row${isActive ? " is-sel" : ""}`}>
              <Avatar emoji={b.emoji} kind={b.kind} />
              <span className="row-m">
                <span className="row-t">
                  <b>{b.name}</b>
                  <time>{listTime(b.last_at)}</time>
                </span>
              </span>
              {b.unread > 0 && <span className="badge">{b.unread}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="shell-main">
        <main className="col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
