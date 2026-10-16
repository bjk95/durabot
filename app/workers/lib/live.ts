import { EMPTY_LIVE, type Live } from "../../app/lib/protocol";

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return typeof content === "string" ? content : "";
  return content
    .filter((p: any) => p?.type === "text")
    .map((p: any) => p.text ?? "")
    .join("");
}

/** Fold one Pi agent event into the live view of the current run. */
export function reduceLive(s: Live, ev: any): Live {
  switch (ev?.type) {
    case "snapshot":
      return {
        running: !!ev.run,
        text: textOf(ev.generation?.message?.content),
        tools: (ev.tools ?? []).map((t: any) => ({ id: t.callId, name: t.name, done: t.status === "done" })),
      };
    case "run_start":
      return { running: true, text: "", tools: [] };
    case "run_end":
      return EMPTY_LIVE;
    case "message_start":
      return ev.message?.role === "assistant" ? { ...s, running: true, text: "" } : s;
    case "message_update": {
      let text = s.text;
      for (const c of ev.changes ?? []) {
        if (c.type === "text_delta") text += c.delta;
        else if (c.type === "text_start") text += textOf([c.block]);
        else if (c.type === "block") {
          if (c.block?.type === "text") text = c.block.text ?? text;
        } else if (c.type === "message") text = textOf(c.message?.content);
      }
      return { ...s, running: true, text };
    }
    case "message_end":
      return { ...s, text: "" };
    case "tool_execution_start":
      return {
        ...s,
        running: true,
        tools: [...s.tools.filter((t) => t.id !== ev.toolCallId), { id: ev.toolCallId, name: ev.toolName, done: false }],
      };
    case "tool_execution_end":
      return { ...s, tools: s.tools.map((t) => (t.id === ev.toolCallId ? { ...t, done: true } : t)) };
    default:
      return s;
  }
}
