#!/usr/bin/env node
import crypto from "node:crypto";
import postgres from "postgres";

if (process.loadEnvFile) {
  try { process.loadEnvFile(); } catch {}
}

const identifier = process.argv[2];
const amountStr = process.argv[3];

if (!identifier || !amountStr) {
  console.log("Użycie: node scripts/grant.js <user_id_lub_nick_lub_email> <kwota>");
  process.exit(1);
}

const amount = parseInt(amountStr, 10);
if (isNaN(amount) || amount === 0) {
  console.error("Błąd: Nieprawidłowa kwota (musi być liczbą różną od 0).");
  process.exit(1);
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

async function main() {
  const [player] = await sql`
    SELECT 
      p.user_id, 
      p.nick, 
      COALESCE(SUM(l.amount), 0)::bigint AS balance 
    FROM players p
    LEFT JOIN ledger_entries l ON p.user_id = l.user_id
    WHERE p.user_id = ${identifier} OR p.nick = ${identifier} OR p.email = ${identifier}
    GROUP BY p.user_id, p.nick
  `;
  if (!player) {
    console.error(`Błąd: Nie znaleziono gracza o identyfikatorze (user_id/nick/email): "${identifier}".`);
    await sql.end();
    process.exit(1);
  }

  const now = Date.now();
  let newBal = 0;

  await sql.begin(async (tx) => {
    await tx`SELECT nick FROM players WHERE user_id = ${player.user_id} FOR UPDATE`;
    const [balRow] = await tx`
      SELECT COALESCE(SUM(amount), 0)::bigint AS sum FROM ledger_entries WHERE user_id = ${player.user_id}
    `;
    const curBal = Number(balRow?.sum || 0);
    newBal = curBal + amount;

    await tx`
      UPDATE players
      SET updated_at = ${now}
      WHERE user_id = ${player.user_id}
    `;

    await tx`
      INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
      VALUES (${crypto.randomUUID()}, ${player.user_id}, 'grant', ${amount}, ${newBal}, ${now})
    `;
  });

  console.log(`✓ Pomyślnie zrealizowano przyznanie środków dla gracza "${player.nick}":`);
  console.log(`  Kwota:            ${amount > 0 ? "+" : ""}${amount} $FGT`);
  console.log(`  Poprzednie saldo: ${player.balance} $FGT`);
  console.log(`  Nowe saldo:       ${newBal} $FGT`);

  await sql.end();
}

main().catch(async (e) => {
  console.error("Błąd bazy danych:", e.message);
  await sql.end();
  process.exit(1);
});
