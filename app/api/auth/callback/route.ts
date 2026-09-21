import { getSql, initPgTables } from "@/db";
import { exchangeCodeForTokens, fetchUserInfo, getOidcConfig } from "@/lib/auth/oidc";
import { createSessionCookie, parseCookie, signSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return new Response(`Błąd logowania Authentik: ${error} - ${errorDescription || ""}`, {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (!code) {
    return new Response("Brak kodu autoryzacyjnego OIDC.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const cookieHeader = request.headers.get("cookie");
  const savedState = parseCookie(cookieHeader, "casino_oidc_state");

  if (savedState && state && savedState !== state) {
    return new Response("Nieprawidłowy parametr stanu OIDC (CSRF).", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const origin = url.origin;
    const config = await getOidcConfig(origin);

    // 1. Backchannel token exchange (Direct POST to Authentik /token/)
    const tokenRes = await exchangeCodeForTokens(config, code);

    // 2. Backchannel userinfo fetch (Direct GET to Authentik /userinfo/)
    const userInfo = await fetchUserInfo(config, tokenRes.access_token);

    const userId = userInfo.sub;
    const email = userInfo.email || `${userId}@authentik.local`;
    const fullName = userInfo.name || null;

    // Extract username (nick) from Authentik preferred_username, nickname or email prefix
    const username = (
      userInfo.preferred_username ||
      userInfo.nickname ||
      email.split("@")[0] ||
      "Gracz"
    ).trim().slice(0, 30);
    const nick = username;

    const rawName = (userInfo.given_name || userInfo.name || "").trim();
    const firstName = (
      rawName ? rawName.split(/\s+/)[0] : nick
    ).slice(0, 20);

    // 3. Upsert player in DB (PostgreSQL)
    await initPgTables();
    const sql = getSql();
    const [existing] = await sql<{ user_id: string }[]>`
      SELECT user_id FROM players WHERE user_id = ${userId}
    `;

    const now = Date.now();
    let finalNick = nick;
    const [nickTaken] = await sql<{ user_id: string }[]>`
      SELECT user_id FROM players WHERE nick = ${finalNick} AND user_id != ${userId}
    `;
    if (nickTaken) {
      finalNick = `${nick.slice(0, 15)}_${userId.slice(0, 4)}`;
    }

    if (!existing) {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO players (user_id, email, nick, xp, level, streak, created_at, updated_at)
          VALUES (${userId}, ${email}, ${finalNick}, 0, 1, 0, ${now}, ${now})
        `;
        await tx`
          INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
          VALUES (${crypto.randomUUID()}, ${userId}, 'welcome_bonus', 1000, 1000, ${now})
        `;
      });
    } else {
      await sql`
        UPDATE players SET email = ${email}, nick = ${finalNick}, updated_at = ${now} WHERE user_id = ${userId}
      `;
    }

    // 4. Create signed session
    const signedSession = await signSession({
      userId,
      email,
      nick: finalNick,
      fullName,
      firstName,
      createdAt: now,
    });

    const isProd = process.env.NODE_ENV === "production";
    const secure = isProd ? "; Secure" : "";
    const sessionCookie = createSessionCookie(signedSession);
    const clearStateCookie = `casino_oidc_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;

    const headers = new Headers();
    headers.set("Location", "/");
    headers.append("Set-Cookie", sessionCookie);
    headers.append("Set-Cookie", clearStateCookie);

    return new Response(null, {
      status: 302,
      headers,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Nieznany błąd logowania";
    return new Response(`Błąd przetwarzania logowania: ${msg}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
