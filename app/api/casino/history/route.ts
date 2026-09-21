import { headers } from "next/headers";
import { getSql } from "@/db";
import { parseCookie, verifySession } from "@/lib/auth/session";

const json = (data: unknown, status = 200) => Response.json(data, { status });

async function identity() {
  const h = await headers();
  const cookieHeader = h.get("cookie");
  const sessionToken = parseCookie(cookieHeader, "casino_session");
  if (!sessionToken) throw new Error("UNAUTHORIZED");
  const session = await verifySession(sessionToken);
  if (!session) throw new Error("UNAUTHORIZED");
  return { userId: session.userId, email: session.email };
}

export async function GET(request: Request) {
  try {
    const { userId } = await identity();
    const url = new URL(request.url);
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10) || 10));

    const sql = getSql();

    const entries = await sql`
      SELECT 
        l.id,
        l.type,
        l.amount,
        l.balance_after AS "balanceAfter",
        l.created_at AS "createdAt",
        g.game,
        g.result,
        g.bet,
        g.payout
      FROM ledger_entries l
      LEFT JOIN game_rounds g ON l.round_id = g.id
      WHERE l.user_id = ${userId}
      ORDER BY l.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [totalRow] = await sql<{ count: string }[]>`
      SELECT count(*) as count FROM ledger_entries WHERE user_id = ${userId}
    `;
    const total = totalRow ? parseInt(totalRow.count, 10) : 0;

    return json({
      entries,
      total,
      hasMore: offset + entries.length < total,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return json({ error: "Zaloguj się przez Authentik." }, 401);
    }
    return json({ error: e instanceof Error ? e.message : "Błąd serwera" }, 500);
  }
}
