import { buildAuthorizationUrl, getOidcConfig } from "@/lib/auth/oidc";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const config = await getOidcConfig(origin);

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  const authUrl = buildAuthorizationUrl(config, state, nonce);

  // Set transient state cookie for CSRF verification
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd ? "; Secure" : "";
  const stateCookie = `casino_oidc_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      "Set-Cookie": stateCookie,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
