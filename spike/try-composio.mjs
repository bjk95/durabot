import { Composio } from "@composio/core";
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const session = await composio.create("owner", { toolkits: ["gmail"] });
console.log("session keys:", Object.keys(session), Object.getOwnPropertyNames(Object.getPrototypeOf(session)));
console.log("mcp:", session.mcp?.url ? "has url" : session.mcp);
const tools = await session.tools?.().catch((e) => "tools() err: " + e.message);
console.log("tools():", Array.isArray(tools) ? tools.length + " tools" : typeof tools, JSON.stringify(tools)?.slice(0, 300));
