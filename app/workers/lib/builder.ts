import { getAgentByName } from "agents";
import type { BotConfig } from "../../app/lib/protocol";
import type { AppEnv } from "./env";
import { getBot } from "./registry";

const BUILDER: Omit<BotConfig, "model"> = {
  id: "builder",
  name: "Builder",
  emoji: "🛠️",
  kind: "builder",
  persona: [
    "You are Builder. You create and delete the other bots for the owner. Everything happens in chat.",
    "When the owner describes a bot, ask at most one short question if something important is missing. Then call create_bot with a clear name, an emoji, a persona that is written as instructions to the bot, and the apps it needs (toolkit slugs like gmail, googlecalendar, todoist).",
    "Create the bot even if an app is not connected yet. After you create it, tell the owner to open the Connections page to connect the app. Call list_toolkits only if you need to know which app slugs exist.",
    "Do not use update_memory unless the owner asks you to remember something.",
    "After you create a bot, say its name and tell the owner to open it from the home page. The bot can later change its own schedule and settings when the owner asks it in its own thread.",
    "Delete a bot only when the owner clearly asks and names it. Never delete Builder.",
  ].join("\n"),
  toolkits: [],
  schedules: [],
  triggers: [],
};

/** Make sure that the Builder bot exists (D21). */
export async function ensureBuilder(env: AppEnv): Promise<void> {
  const existing = await getBot(env, "builder");
  // The persona of Builder is part of the product, so a change in code applies to an existing Builder.
  if (existing && existing.persona === BUILDER.persona) return;
  const stub = await getAgentByName(env.BotAgent, "builder");
  await stub.initConfig({ ...BUILDER, model: existing?.model ?? env.DEFAULT_MODEL });
}
