export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  endSessionEndpoint?: string;
  jwksUri?: string;
}

export interface OidcTokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
}

export interface OidcUserInfo {
  sub: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  nickname?: string;
  given_name?: string;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getOidcConfig(origin?: string): OidcConfig {
  const issuer = trimTrailingSlash(
    process.env.AUTHENTIK_ISSUER || "https://authentik.example.com/application/o/kasyno"
  );
  const clientId = process.env.AUTHENTIK_CLIENT_ID || "kasyno-client-id";
  const clientSecret = process.env.AUTHENTIK_CLIENT_SECRET || "kasyno-client-secret";
  
  const appUrl = trimTrailingSlash(
    process.env.APP_URL || origin || "http://localhost:5173"
  );
  const redirectUri = process.env.AUTHENTIK_REDIRECT_URI || `${appUrl}/api/auth/callback`;

  // Standard Authentik endpoints
  const authorizationEndpoint =
    process.env.AUTHENTIK_AUTH_URL || `${issuer}/authorize/`;
  const tokenEndpoint =
    process.env.AUTHENTIK_TOKEN_URL || `${issuer}/token/`;
  const userinfoEndpoint =
    process.env.AUTHENTIK_USERINFO_URL || `${issuer}/userinfo/`;
  const endSessionEndpoint =
    process.env.AUTHENTIK_END_SESSION_URL || `${issuer}/end-session/`;
  const jwksUri = `${issuer}/jwks/`;

  return {
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    authorizationEndpoint,
    tokenEndpoint,
    userinfoEndpoint,
    endSessionEndpoint,
    jwksUri,
  };
}

export function buildAuthorizationUrl(
  config: OidcConfig,
  state: string,
  nonce: string
): string {
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri!);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  return url.toString();
}

/**
 * Backchannel token exchange: POST directly to Authentik token endpoint
 */
export async function exchangeCodeForTokens(
  config: OidcConfig,
  code: string,
  overrideRedirectUri?: string
): Promise<OidcTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: overrideRedirectUri || config.redirectUri!,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const res = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${errorText}`);
  }

  return (await res.json()) as OidcTokenResponse;
}

/**
 * Backchannel userinfo fetch: GET to Authentik userinfo endpoint
 */
export async function fetchUserInfo(
  config: OidcConfig,
  accessToken: string
): Promise<OidcUserInfo> {
  const res = await fetch(config.userinfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to fetch userinfo (${res.status}): ${errorText}`);
  }

  return (await res.json()) as OidcUserInfo;
}

/**
 * Parse an unverified JWT payload (used for inspecting sub/sid in tokens)
 */
export function parseJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = Buffer.from(base64, "base64").toString("utf-8");
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}
