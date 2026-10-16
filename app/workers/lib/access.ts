import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppEnv } from "./env";

const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function isLocal(request: Request): boolean {
  const h = new URL(request.url).hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
}

/**
 * Cloudflare Access check (D1). Returns a Response to stop the request, or null to continue.
 * With no Access settings the Worker only answers local requests (secure by default).
 */
export async function checkAccess(request: Request, env: AppEnv): Promise<Response | null> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    if (isLocal(request)) return null;
    return new Response("Access is not set up. Set ACCESS_TEAM_DOMAIN and ACCESS_AUD.", { status: 403 });
  }
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return new Response("Forbidden", { status: 403 });
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  let set = jwks.get(issuer);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwks.set(issuer, set);
  }
  try {
    await jwtVerify(token, set, { issuer, audience: env.ACCESS_AUD });
    return null;
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
}
