#!/usr/bin/env node
import postgres from "postgres";

if (process.loadEnvFile) {
  try { process.loadEnvFile(); } catch {}
}

const url = process.env.DATABASE_URL || "postgres://kasyno:kasyno_pass@127.0.0.1:5432/kasyno";
const sql = postgres(url, {
  types: {
    bigint: {
      to: 20,
      from: [20],
      parse: (x) => Number(x),
      serialize: (x) => String(x),
    },
  },
});

function formatTime(ts) {
  if (!ts) return "-";
  return new Date(Number(ts)).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });
}

async function main() {
  const players = await sql`
    SELECT 
      p.user_id,
      p.nick,
      p.email,
      p.updated_at,
      MAX(l.created_at) AS last_tx,
      COALESCE(SUM(l.amount), 0)::bigint AS balance,
      COUNT(l.id)::int AS entry_count
    FROM players p
    LEFT JOIN ledger_entries l ON p.user_id = l.user_id
    GROUP BY p.user_id, p.nick, p.email, p.updated_at
    ORDER BY COALESCE(MAX(l.created_at), p.updated_at) DESC
    LIMIT 30
  `;

  if (players.length === 0) {
    console.log("Brak zarejestrowanych graczy.");
    await sql.end();
    return;
  }

  console.log("\n=== AUDYT KSIĘGI TRANSAKCJI (LEDGER) ===");
  console.table(
    players.map((p) => ({
      Nick: p.nick,
      Email: p.email,
      "Aktualne Saldo (z Ledgeru)": `${p.balance.toLocaleString("pl-PL")} $FGT`,
      "Liczba Wpisów": p.entry_count,
      "Ostatnia aktywność": formatTime(p.last_tx || p.updated_at),
      "Status": p.balance < 0 ? "NIEPRAWIDŁOWE (ujemne)" : "OK",
    }))
  );

  const negative = players.filter((p) => p.balance < 0);
  if (negative.length > 0) {
    console.error(`\n[OSTRZEŻENIE] Znaleziono ${negative.length} graczy z ujemnym saldem w księdze:`);
    negative.forEach((n) => console.error(` - ${n.nick} (${n.user_id}): ${n.balance}`));
  } else {
    console.log("\n✓ Wszystkie salda w księdze są prawidłowe i nieujemne.");
  }

  await sql.end();
}

main().catch(async (e) => {
  console.error("Błąd audytu:", e.message);
  await sql.end();
  process.exit(1);
});

