// Small text helpers for the interface.

const DAY = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Date divider in a thread: Today, Yesterday, a weekday, or a date. */
export function dayLabel(ts: number, now: Date = new Date()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(new Date(ts))) / DAY);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  const d = new Date(ts);
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

/** Time in a list row: a clock time today, then Yesterday, a short weekday, or a short date. */
export function listTime(ts: number, now: Date = new Date()): string {
  if (!ts) return "";
  const diff = Math.round((startOfDay(now) - startOfDay(new Date(ts))) / DAY);
  const d = new Date(ts);
  if (diff <= 0) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Time of a run in the run list. */
export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function sentence(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** GMAIL_NEW_GMAIL_MESSAGE becomes "New gmail message". */
export function humanizeSlug(slug: string): string {
  const parts = slug.split("_");
  const rest = parts.length > 2 ? parts.slice(1) : parts;
  return sentence(rest.join(" ").toLowerCase());
}

/** The origin of a proactive input: "schedule: weekdays at 8am" or "trigger: SLUG". */
export function originOf(label: string | null | undefined): { kind: "schedule" | "trigger"; text: string } | null {
  if (!label) return null;
  const m = label.match(/^(schedule|trigger):\s*(.*)$/i);
  if (!m) return { kind: "schedule", text: sentence(label) };
  const kind = m[1]!.toLowerCase() as "schedule" | "trigger";
  const rest = m[2] ?? "";
  return { kind, text: kind === "trigger" ? humanizeSlug(rest) : sentence(rest) };
}

/** The name in a tool row summary: "NAME(args) → result" gives NAME. */
export function toolName(summary: string): string {
  return summary.split("(")[0]!.trim();
}

/** A quiet verb for a tool line. */
export function toolVerb(name: string, running = false): string {
  if (running) return "Using";
  if (name === "COMPOSIO_SEARCH_TOOLS" || name === "COMPOSIO_GET_TOOL_SCHEMAS") return "Searched tools";
  if (name === "COMPOSIO_MANAGE_CONNECTIONS") return "Checked connections";
  if (name === "search_history") return "Searched history";
  if (name === "configure_self" || name === "configure_bot") return "Changed settings";
  return "Used";
}

/** "anthropic/claude-sonnet-5.5" becomes "claude-sonnet-5.5"; ":free" stays. */
export function modelShort(id: string): string {
  return id.split("/").at(-1) ?? id;
}

/** "googlecalendar" becomes "Googlecalendar"; used only when no name is known. */
export function appName(slug: string | undefined): string {
  return slug ? sentence(slug) : "this app";
}

/** Plain text for a status badge. */
export function statusWord(status: string): string {
  return status === "done" ? "Done" : status === "error" ? "Error" : status === "running" ? "Running" : "Stopped";
}
