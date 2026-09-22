#!/usr/bin/env node
import crypto from "node:crypto";
import postgres from "postgres";

if (process.loadEnvFile) {
  try { process.loadEnvFile(); } catch {}
}

const action = process.argv[2] || "list";
const targetId = process.argv[3];

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
  return new Date(Number(ts)).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });
}

async function main() {
  if (action === "list") {
    const logs = await sql`
      SELECT id, user_id, nick, previous_balance, reason, details, created_at, restored_at
      FROM fraud_logs
      ORDER BY created_at DESC
      LIMIT 30
    `;

    if (logs.length === 0) {
      console.log("Brak wpisów w tabeli fraud_logs.");
      await sql.end();
      return;
    }

    console.log("\n=== HISTORIA WYKRYĆ ANTYFRAUDOWYCH (ostatnie 30) ===");
    console.table(
      logs.map((l) => ({
        ID: l.id,
        Gracz: `${l.nick} (${l.user_id})`,
        "Poprzednie Saldo": l.previous_balance.toLocaleString("pl-PL"),
        Powód: l.reason,
        Kiedy: formatTime(l.created_at),
        Przywrócono: l.restored_at ? formatTime(l.restored_at) : "NIE",
      }))
    );
    console.log("\nAby przywrócić saldo gracza na podstawie wpisu, uruchom:");
    console.log("  node scripts/fraud_audit.js restore <ID_WPISU>\n");
    await sql.end();
    return;
  }

  if (action === "restore") {
    if (!targetId) {
      console.error("Błąd: Podaj ID wpisu z fraud_logs: node scripts/fraud_audit.js restore <ID>");
      await sql.end();
      process.exit(1);
    }

    const [log] = await sql`
      SELECT id, user_id, nick, previous_balance, restored_at
      FROM fraud_logs
      WHERE id = ${targetId}
    `;

    if (!log) {
      console.error(`Błąd: Nie znaleziono wpisu o ID "${targetId}".`);
      await sql.end();
      process.exit(1);
    }

    if (log.restored_at) {
      console.error(`Uwaga: Ten wpis został już przywrócony dnia ${formatTime(log.restored_at)}.`);
      await sql.end();
      process.exit(1);
    }

    if (log.previous_balance <= 0) {
      console.error(`Błąd: Poprzednie saldo wynosiło 0, brak środków do przywrócenia.`);
      await sql.end();
      process.exit(1);
    }

    const t = Date.now();
    let newBal = 0;

    await sql.begin(async (tx) => {
      await tx`SELECT nick FROM players WHERE user_id = ${log.user_id} FOR UPDATE`;
      const [balRow] = await tx`
        SELECT COALESCE(SUM(amount), 0)::bigint AS sum FROM ledger_entries WHERE user_id = ${log.user_id}
      `;
      const curBal = Number(balRow?.sum || 0);
      newBal = curBal + Number(log.previous_balance);

      await tx`
        UPDATE players
        SET updated_at = ${t}
        WHERE user_id = ${log.user_id}
      `;

      await tx`
        INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
        VALUES (${crypto.randomUUID()}, ${log.user_id}, 'fraud_restoration', ${log.previous_balance}, ${newBal}, ${t})
      `;

      await tx`
        UPDATE fraud_logs
        SET restored_at = ${t}
        WHERE id = ${log.id}
      `;
    });

    console.log(`[OK] Przywrócono ${log.previous_balance.toLocaleString("pl-PL")} żetonów dla gracza ${log.nick}.`);
    console.log(`Aktualne saldo gracza: ${newBal.toLocaleString("pl-PL")}`);
    await sql.end();
    return;
  }

  console.log("Nieznana akcja. Użycie: node scripts/fraud_audit.js [list|restore <id>]");
  await sql.end();
}

main().catch((err) => {
  console.error("Wystąpił błąd:", err);
  process.exit(1);
});
