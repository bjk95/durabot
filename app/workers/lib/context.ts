import { createContext } from "react-router";
import type { AppEnv } from "./env";

/** The Worker env and execution context, passed to loaders and actions. */
export const cloudflareContext = createContext<{ env: AppEnv; ctx: ExecutionContext }>();
