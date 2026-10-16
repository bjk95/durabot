import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/shell.tsx", [
    index("routes/home.tsx"),
    route("bots/:id", "routes/bot.tsx"),
    route("connections", "routes/connections.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),
  route("api/push", "routes/api.push.ts"),
] satisfies RouteConfig;
