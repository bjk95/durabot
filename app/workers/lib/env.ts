/** Worker environment: the bindings from wrangler.jsonc plus secrets and optional settings. */
export interface AppEnv extends Env {
  // Optional secrets (the generated Env lists the ones in .dev.vars).
  COMPOSIO_WEBHOOK_SECRET?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  /** "faux" selects the scripted model used by tests. */
  MODEL_BACKEND?: string;
  /** Cloudflare Access: set both to turn on the JWT check (D1). */
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Set to "1" to skip the Access check on a local host. */
  ALLOW_LOCAL?: string;
}

/** The single Composio user id of the owner (D25). */
export const OWNER_ID = "owner";
