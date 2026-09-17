export interface SessionUser {
  userId: string;
  email: string;
  nick: string;
  fullName?: string | null;
  firstName?: string | null;
  sessionId?: string;
  createdAt: number;
}

const COOKIE_NAME = "casino_session";
const DEFAULT_SECRET = "kasyno-2fgt-secret-key-replace-in-env-production-32-chars";

function getSecret(): string {
  return process.env.SESSION_SECRET || DEFAULT_SECRET;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

export async function signSession(user: SessionUser): Promise<string> {
  const payload = JSON.stringify(user);
  const base64Payload = Buffer.from(payload, "utf-8").toString("base64url");
  const key = await getHmacKey(getSecret());
  const enc = new TextEncoder();
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(base64Payload));
  const hexSig = bufferToHex(signature);
  return `${base64Payload}.${hexSig}`;
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [base64Payload, hexSig] = parts;
    const key = await getHmacKey(getSecret());
    const enc = new TextEncoder();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      hexToBuffer(hexSig),
      enc.encode(base64Payload)
    );
    if (!valid) return null;
    const jsonStr = Buffer.from(base64Payload, "base64url").toString("utf-8");
    const user = JSON.parse(jsonStr) as SessionUser;
    // 30 days max session lifetime
    if (!user.userId || !user.createdAt || Date.now() - user.createdAt > 30 * 24 * 3600 * 1000) {
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

export function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function createSessionCookie(signedToken: string, maxAgeSec = 30 * 24 * 3600): string {
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(signedToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export function clearSessionCookie(): string {
  const isProd = process.env.NODE_ENV === "production";
  const secure = isProd ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}
