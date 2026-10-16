import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("bots/:id", "routes/bot.tsx"),
  route("connections", "routes/connections.tsx"),
  route("settings", "routes/settings.tsx"),
  route("api/push", "routes/api.push.ts"),
] satisfies RouteConfig;
