import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseCookie, verifySession } from "@/lib/auth/session";

export type AuthUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  firstName?: string | null;
};

export type ChatGPTUser = AuthUser;

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
      const parsedFirstName =
        session.firstName ||
        (session.fullName ? session.fullName.trim().split(/\s+/)[0] : null) ||
        session.nick;
      return {
        userId: session.userId,
        displayName: parsedFirstName || session.email.split("@")[0],
        email: session.email,
        fullName: session.fullName || null,
        firstName: parsedFirstName,
      };
    }
  }

  return null;
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  return getAuthUser();
}

export async function requireAuthUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (user) return user;
  redirect(SIGN_IN_PATH);
}

export async function requireChatGPTUser(): Promise<ChatGPTUser> {
  return requireAuthUser();
}

export function authSignInPath(): string {
  return SIGN_IN_PATH;
}

export function authSignOutPath(): string {
  return SIGN_OUT_PATH;
}

export function chatGPTSignInPath(_returnTo?: string): string {
  return SIGN_IN_PATH;
}

export function chatGPTSignOutPath(_returnTo?: string): string {
  return SIGN_OUT_PATH;
}
