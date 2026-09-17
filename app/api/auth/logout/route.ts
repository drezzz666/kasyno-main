import { getOidcConfig } from "@/lib/auth/oidc";
import { clearSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const config = getOidcConfig(url.origin);

  const clearCookie = clearSessionCookie();
  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie);

  // If Authentik end_session is configured, redirect there to terminate SSO session
  const redirectDestination = config.endSessionEndpoint
    ? `${config.endSessionEndpoint}?post_logout_redirect_uri=${encodeURIComponent(url.origin)}`
    : "/";

  headers.set("Location", redirectDestination);

  return new Response(null, {
    status: 302,
    headers,
  });
}

export async function POST() {
  const clearCookie = clearSessionCookie();
  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "Set-Cookie": clearCookie,
      },
    }
  );
}
