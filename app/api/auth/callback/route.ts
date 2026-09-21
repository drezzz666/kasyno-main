import { getSql, initPgTables } from "@/db";
import { createSessionCookie, signSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      return new Response("Brak parametru code lub state.", { status: 400 });
    }

    // 1. Verify state cookie
    const cookieHeader = request.headers.get("cookie") || "";
    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .map((c) => c.trim().split("="))
        .filter(([k]) => Boolean(k))
    );
    const storedState = cookies["casino_oidc_state"];
    if (!storedState || storedState !== state) {
      return new Response("Nieprawidłowy parametr state (CSRF detected).", { status: 403 });
    }

    // 2. Exchange code for tokens
    const issuer = process.env.AUTHENTIK_ISSUER?.replace(/\/+$/, "");
    const tokenUrl = process.env.AUTHENTIK_TOKEN_URL || `${issuer}/token/`;
    const userinfoUrl = process.env.AUTHENTIK_USERINFO_URL || `${issuer}/userinfo/`;
    const clientId = process.env.AUTHENTIK_CLIENT_ID || "";
    const clientSecret = process.env.AUTHENTIK_CLIENT_SECRET || "";
    const appUrl = process.env.APP_URL?.replace(/\/+$/, "") || "http://localhost:3000";
    const redirectUri = process.env.AUTHENTIK_REDIRECT_URI || `${appUrl}/api/auth/callback`;

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[OIDC Callback] Token exchange failed:", errText);
      return new Response(`Błąd wymiany kodu OIDC: ${tokenRes.statusText}`, { status: 502 });
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      return new Response("Brak access_token w odpowiedzi z Authentik.", { status: 502 });
    }

    const userinfoRes = await fetch(userinfoUrl, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });

    if (!userinfoRes.ok) {
      return new Response("Nie udało się pobrać danych użytkownika z Authentik.", { status: 502 });
    }

    const userinfo = (await userinfoRes.json()) as {
      sub?: string;
      email?: string;
      preferred_username?: string;
      nickname?: string;
      name?: string;
      given_name?: string;
    };

    const userId = userinfo.sub;
    const email = userinfo.email || `${userId}@authentik.local`;
    const nick = (userinfo.preferred_username || userinfo.nickname || userinfo.given_name || email.split("@")[0] || "Gracz").slice(0, 30);
    const fullName = userinfo.name || nick;
    const firstName = userinfo.given_name || nick;

    if (!userId) {
      return new Response("Brak identyfikatora użytkownika (sub) z OIDC.", { status: 502 });
    }

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
          INSERT INTO players (user_id, email, nick, balance, xp, level, streak, created_at, updated_at)
          VALUES (${userId}, ${email}, ${finalNick}, 1000, 0, 1, 0, ${now}, ${now})
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
