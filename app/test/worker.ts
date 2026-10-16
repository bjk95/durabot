// Entry for tests: the bot object without the React Router build.
import { routeAgentRequest } from "agents";

export { BotAgent } from "../workers/bot-agent";

export default {
  async fetch(request: Request, env: any) {
    return (await routeAgentRequest(request, env)) ?? new Response("ok");
  },
};
