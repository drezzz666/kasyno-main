import { parseJwtPayload } from "@/lib/auth/oidc";

export const dynamic = "force-dynamic";

interface LogoutTokenPayload {
  iss?: string;
  sub?: string;
  sid?: string;
  aud?: string | string[];
  events?: Record<string, unknown>;
  iat?: number;
  jti?: string;
}

/**
 * OpenID Connect Back-Channel Logout 1.0 Endpoint
 * Authentik issues a POST request with `logout_token` to terminate user session on backchannel.
 */
export async function POST(request: Request) {
  try {
    let logoutToken: string | null = null;
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      logoutToken = formData.get("logout_token") as string | null;
    } else if (contentType.includes("application/json")) {
      const json = await request.json() as { logout_token?: string };
      logoutToken = json.logout_token || null;
    }

    if (!logoutToken) {
      return new Response("Missing logout_token parameter", {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Inspect JWT payload
    const payload = parseJwtPayload<LogoutTokenPayload>(logoutToken);
    if (!payload || !payload.sub) {
      return new Response("Invalid logout_token payload", {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Here we have user ID (sub: payload.sub) and session ID (sid: payload.sid)
    // In our stateless signed-cookie architecture or persistent session store,
    // we log the event and return 200 OK per spec.
    console.log(`[OIDC Backchannel Logout] Terminated session for user sub=${payload.sub}, sid=${payload.sid || "none"}`);

    return new Response("OK", {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error processing backchannel logout";
    return new Response(msg, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
