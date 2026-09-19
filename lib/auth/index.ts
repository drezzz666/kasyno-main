import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseCookie, verifySession } from "./session";

export * from "./session";
export * from "./oidc";

export interface AuthUser {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  firstName?: string | null;
}

const SIGN_IN_PATH = "/api/auth/login";
const SIGN_OUT_PATH = "/api/auth/logout";

/**
 * Returns currently authenticated user via OIDC session cookie.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const requestHeaders = await headers();
  const cookieHeader = requestHeaders.get("cookie");
  const sessionToken = parseCookie(cookieHeader, "casino_session");

  if (sessionToken) {
    const session = await verifySession(sessionToken);
    if (session) {
      const username =
        session.nick ||
        session.firstName ||
        (session.fullName ? session.fullName.trim().split(/\s+/)[0] : null) ||
        session.email.split("@")[0];
      return {
        userId: session.userId,
        displayName: username,
        email: session.email,
        fullName: session.fullName || null,
        firstName: session.firstName || username,
      };
    }
  }

  return null;
}

export async function requireAuthUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (user) return user;
  redirect(SIGN_IN_PATH);
}

export function authSignInPath(): string {
  return SIGN_IN_PATH;
}

export function authSignOutPath(): string {
  return SIGN_OUT_PATH;
}
