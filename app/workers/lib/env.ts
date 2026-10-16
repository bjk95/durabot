/**
 * Worker environment: the generated bindings (wrangler.jsonc and .dev.vars) plus the settings that
 * can be missing. A missing setting is an empty or undefined value at runtime, so code must test it.
 * They are typed as plain strings so that this type also fits the generated `Env`, which lists a
 * setting as a string when it is present in .dev.vars or in wrangler.jsonc.
 */
export interface AppEnv extends Env {
  CF_AIG_TOKEN: string;
  COMPOSIO_WEBHOOK_SECRET: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  /** "faux" selects the scripted model used by tests. */
  MODEL_BACKEND: string;
  /** Cloudflare Access: set both to turn on the JWT check (D1). */
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
}

/** The single Composio user id of the owner (D25). */
export const OWNER_ID = "owner";
