import { Pin } from "lucide-react";
import { Link, useRouteLoaderData } from "react-router";
import { Avatar, LargeTitleScreen, NavButtons } from "../components/ui";
import { listTime } from "../lib/format";
import type { BotListItem } from "../lib/protocol";

export default function Home() {
  const data = useRouteLoaderData("routes/shell") as { bots: BotListItem[] } | undefined;
  const bots = data?.bots ?? [];
  const onlyBuilder = bots.length <= 1;

  return (
    <LargeTitleScreen title="durabot" right={<NavButtons />} flush>
      <div className="list">
        {bots.map((b) => (
          <Link key={b.id} to={`/bots/${b.id}`} className="row">
            <Avatar emoji={b.emoji} kind={b.kind} />
            <span className="row-m">
              <span className="row-t">
                <b>{b.name}</b>
                <time>{b.last_at ? listTime(b.last_at) : b.kind === "builder" ? "Now" : ""}</time>
              </span>
              <span className="row-s">
                <span>{b.last_text || (b.kind === "builder" ? "Describe a bot and I will build it." : "No messages yet")}</span>
                {b.kind === "builder" ? (
                  <span className="pin" aria-label="Pinned">
                    <Pin className="i" width={14} height={14} strokeWidth={1.8} />
                  </span>
                ) : (
                  b.unread > 0 && <span className="badge">{b.unread}</span>
                )}
              </span>
            </span>
          </Link>
        ))}
      </div>
      {onlyBuilder && (
        <div className="empty" style={{ paddingTop: 8 }}>
          <p>Open Builder and say what you want.</p>
          <span className="suggest">Make a bot that checks my inbox every weekday at 8am.</span>
        </div>
      )}
    </LargeTitleScreen>
  );
}
