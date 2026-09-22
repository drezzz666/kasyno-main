#!/usr/bin/env node
import crypto from "node:crypto";
import postgres from "postgres";

if (process.loadEnvFile) {
  try { process.loadEnvFile(); } catch {}
}

const MAX_PAYOUT = 252_000;

function formatNumber(n) {
  return Number(n || 0).toLocaleString("pl-PL");
}

function formatFgt(n) {
  return `${formatNumber(n)} $FGT`;
}

function formatTime(ts) {
  if (!ts) return "-";
  return new Date(Number(ts)).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });
}

async function createClient() {
  const pgTypes = {
    bigint: {
      to: 20,
      from: [20],
      parse: (x) => Number(x),
      serialize: (x) => String(x),
    },
  };

  const initialUrl = process.env.DATABASE_URL || "postgres://kasyno:kasyno_pass@127.0.0.1:5432/kasyno";
  let client = postgres(initialUrl, { types: pgTypes, connect_timeout: 3 });

  try {
    await client`SELECT 1`;
    return client;
  } catch (err) {
    if (initialUrl.includes("@postgres:") && (err.code === "ENOTFOUND" || err.message?.includes("ENOTFOUND"))) {
      await client.end().catch(() => {});
      const fallbackUrl = initialUrl.replace("@postgres:", "@127.0.0.1:");
      client = postgres(fallbackUrl, { types: pgTypes, connect_timeout: 3 });
      await client`SELECT 1`;
      return client;
    }
    throw err;
  }
}

async function resolvePlayer(sql, identifier) {
  if (!identifier) return null;
  const [p] = await sql`
    SELECT 
      p.user_id,
      p.email,
      p.nick,
      p.xp,
      p.level,
      p.streak,
      p.last_bonus_day,
      p.created_at,
      p.updated_at,
      COALESCE(SUM(l.amount), 0)::bigint AS balance
    FROM players p
    LEFT JOIN ledger_entries l ON p.user_id = l.user_id
    WHERE p.user_id = ${identifier} OR p.nick = ${identifier} OR p.email = ${identifier}
    GROUP BY p.user_id, p.email, p.nick, p.xp, p.level, p.streak, p.last_bonus_day, p.created_at, p.updated_at
  `;
  return p || null;
}

// ================= COMMAND HANDLERS =================

async function handlePlayers(sql, args) {
  const sub = args[0] || "list";

  if (sub === "list") {
    const list = await sql`
      SELECT 
        p.user_id,
        p.nick,
        p.email,
        p.level,
        p.streak,
        p.created_at,
        COALESCE(l.balance, 0)::bigint AS balance,
        COALESCE(g.rounds_count, 0)::int AS rounds_count
      FROM players p
      LEFT JOIN (
        SELECT user_id, SUM(amount) AS balance FROM ledger_entries GROUP BY user_id
      ) l ON p.user_id = l.user_id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS rounds_count FROM game_rounds GROUP BY user_id
      ) g ON p.user_id = g.user_id
      ORDER BY p.created_at DESC
      LIMIT 30
    `;

    console.log(`\n=== LISTA GRACZY (${list.length}) ===`);
    console.table(
      list.map((p) => ({
        Nick: p.nick,
        Saldo: formatFgt(p.balance),
        Poziom: p.level,
        Streak: p.streak,
        Rundy: p.rounds_count,
        Email: p.email,
        "User ID": p.user_id,
      }))
    );
    return;
  }

  if (sub === "show") {
    const id = args[1];
    if (!id) {
      console.error("Użycie: pnpm admin players show <nick|user_id|email>");
      return;
    }
    const p = await resolvePlayer(sql, id);
    if (!p) {
      console.error(`Nie znaleziono gracza "${id}".`);
      return;
    }

    const [stats] = await sql`
      SELECT 
        COUNT(*)::int AS total_rounds,
        COALESCE(SUM(bet), 0)::bigint AS total_bet,
        COALESCE(SUM(payout), 0)::bigint AS total_payout,
        COUNT(*) FILTER (WHERE payout > bet)::int AS wins,
        COUNT(*) FILTER (WHERE payout = 0 AND state = 'settled')::int AS losses
      FROM game_rounds
      WHERE user_id = ${p.user_id}
    `;

    console.log(`\n================ KARTA GRACZA ===============`);
    console.log(`Nick:             ${p.nick}`);
    console.log(`Email:            ${p.email}`);
    console.log(`User ID:          ${p.user_id}`);
    console.log(`Saldo:            ${formatFgt(p.balance)}`);
    console.log(`Poziom / XP:      Lvl ${p.level} (${formatNumber(p.xp)} XP)`);
    console.log(`Daily Streak:     ${p.streak} dni (ostatni: ${p.last_bonus_day || "brak"})`);
    console.log(`Data rejestracji: ${formatTime(p.created_at)}`);
    console.log(`Ostatnia akcja:   ${formatTime(p.updated_at)}`);
    console.log(`---------------- STATYSTYKI GIER ------------`);
    console.log(`Rozegrane rundy:  ${stats?.total_rounds || 0}`);
    console.log(`Postawiono łącznie: ${formatFgt(stats?.total_bet || 0)}`);
    console.log(`Wypłacono łącznie:  ${formatFgt(stats?.total_payout || 0)}`);
    const net = Number(stats?.total_payout || 0) - Number(stats?.total_bet || 0);
    console.log(`Bilans gry:       ${net >= 0 ? "+" : ""}${formatFgt(net)}`);
    console.log(`Wygrane / Przegrane: ${stats?.wins || 0} / ${stats?.losses || 0}`);
    console.log(`=============================================\n`);
    return;
  }

  if (sub === "rename") {
    const id = args[1];
    const newNick = args[2]?.trim();
    if (!id || !newNick) {
      console.error("Użycie: pnpm admin players rename <nick|user_id|email> <nowy_nick>");
      return;
    }
    const p = await resolvePlayer(sql, id);
    if (!p) {
      console.error(`Nie znaleziono gracza "${id}".`);
      return;
    }
    const [taken] = await sql`SELECT user_id FROM players WHERE nick = ${newNick} AND user_id != ${p.user_id}`;
    if (taken) {
      console.error(`Nick "${newNick}" jest już zajęty przez innego gracza.`);
      return;
    }
    await sql`UPDATE players SET nick = ${newNick}, updated_at = ${Date.now()} WHERE user_id = ${p.user_id}`;
    console.log(`✓ Zmieniono nick gracza z "${p.nick}" na "${newNick}".`);
    return;
  }

  if (sub === "reset-bonus") {
    const id = args[1];
    if (!id) {
      console.error("Użycie: pnpm admin players reset-bonus <nick|user_id|email>");
      return;
    }
    const p = await resolvePlayer(sql, id);
    if (!p) {
      console.error(`Nie znaleziono gracza "${id}".`);
      return;
    }
    await sql`
      UPDATE players
      SET last_bonus_day = NULL, streak = 0, updated_at = ${Date.now()}
      WHERE user_id = ${p.user_id}
    `;
    await sql`DELETE FROM daily_claims WHERE user_id = ${p.user_id}`;
    console.log(`✓ Zresetowano streak i timer codziennego bonusu dla gracza "${p.nick}".`);
    return;
  }

  console.log("Nieznane polecenie players. Dostępne: list, show, rename, reset-bonus");
}

async function handleLedger(sql, args) {
  const sub = args[0] || "audit";

  if (sub === "audit") {
    const players = await sql`
      SELECT 
        p.user_id,
        p.nick,
        COALESCE(SUM(l.amount), 0)::bigint AS balance,
        COUNT(l.id)::int AS entry_count
      FROM players p
      LEFT JOIN ledger_entries l ON p.user_id = l.user_id
      GROUP BY p.user_id, p.nick, p.created_at
      ORDER BY p.created_at DESC
      LIMIT 30
    `;

    console.log(`\n=== AUDYT KSIĘGI LEDGER_ENTRIES ===`);
    console.table(
      players.map((p) => ({
        Nick: p.nick,
        Saldo: formatFgt(p.balance),
        "Wpisy w księdze": p.entry_count,
        Integralność: p.balance < 0 ? "BŁĄD: UJEMNE SALDO" : "OK",
      }))
    );

    const [totalTokensRow] = await sql`SELECT COALESCE(SUM(amount), 0)::bigint as sum FROM ledger_entries`;
    const totalTokens = Number(totalTokensRow?.sum || 0);
    console.log(`Łączna cyrkulacja żetonów w kasynie: ${formatFgt(totalTokens)}`);
    return;
  }

  if (sub === "grant") {
    const id = args[1];
    const amountStr = args[2];
    const reason = args.slice(3).join(" ") || "Admin grant";

    if (!id || !amountStr) {
      console.error("Użycie: pnpm admin ledger grant <nick|user_id|email> <kwota> [powód]");
      return;
    }
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount === 0) {
      console.error("Kwota musi być liczbą różną od zera.");
      return;
    }

    const p = await resolvePlayer(sql, id);
    if (!p) {
      console.error(`Nie znaleziono gracza "${id}".`);
      return;
    }

    const t = Date.now();
    let newBal = 0;
    await sql.begin(async (tx) => {
      await tx`SELECT nick FROM players WHERE user_id = ${p.user_id} FOR UPDATE`;
      const [balRow] = await tx`
        SELECT COALESCE(SUM(amount), 0)::bigint AS sum FROM ledger_entries WHERE user_id = ${p.user_id}
      `;
      const curBal = Number(balRow?.sum || 0);
      newBal = curBal + amount;
      if (newBal < 0) throw new Error(`Operacja spowodowałaby ujemne saldo gracza (${newBal}).`);

      await tx`UPDATE players SET updated_at = ${t} WHERE user_id = ${p.user_id}`;
      await tx`
        INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
        VALUES (${crypto.randomUUID()}, ${p.user_id}, 'grant', ${amount}, ${newBal}, ${t})
      `;
    });

    console.log(`✓ Przyznano środki dla gracza "${p.nick}":`);
    console.log(`  Operacja:         ${amount > 0 ? "+" : ""}${formatFgt(amount)}`);
    console.log(`  Powód:            ${reason}`);
    console.log(`  Poprzednie saldo: ${formatFgt(p.balance)}`);
    console.log(`  Nowe saldo:       ${formatFgt(newBal)}`);
    return;
  }

  if (sub === "history") {
    const id = args[1];
    const limit = Math.min(100, Math.max(1, parseInt(args[2] || "20", 10)));
    if (!id) {
      console.error("Użycie: pnpm admin ledger history <nick|user_id|email> [limit=20]");
      return;
    }
    const p = await resolvePlayer(sql, id);
    if (!p) {
      console.error(`Nie znaleziono gracza "${id}".`);
      return;
    }

    const entries = await sql`
      SELECT 
        l.id,
        l.type,
        l.amount,
        l.balance_after,
        l.created_at,
        g.game,
        g.result
      FROM ledger_entries l
      LEFT JOIN game_rounds g ON l.round_id = g.id
      WHERE l.user_id = ${p.user_id}
      ORDER BY l.created_at DESC
      LIMIT ${limit}
    `;

    console.log(`\n=== HISTORIA LEDGERA DLA "${p.nick}" (ostatnie ${entries.length}) ===`);
    console.table(
      entries.map((e) => ({
        Typ: e.type,
        Kwota: (e.amount > 0 ? "+" : "") + formatFgt(e.amount),
        "Saldo po": formatFgt(e.balance_after),
        Gra: e.game || "-",
        Wynik: e.result || "-",
        Data: formatTime(e.created_at),
      }))
    );
    return;
  }

  console.log("Nieznane polecenie ledger. Dostępne: audit, grant, history");
}

async function handleRounds(sql, args) {
  const sub = args[0] || "list";

  if (sub === "list") {
    const activeOnly = args.includes("--active");
    const limit = Math.min(100, Math.max(1, parseInt(args[1] || "20", 10)));

    const rounds = await sql`
      SELECT 
        r.id,
        p.nick,
        r.game,
        r.state,
        r.bet,
        r.payout,
        r.result,
        r.created_at
      FROM game_rounds r
      JOIN players p ON r.user_id = p.user_id
      ${activeOnly ? sql`WHERE r.state = 'active'` : sql``}
      ORDER BY r.created_at DESC
      LIMIT ${limit}
    `;

    console.log(`\n=== OSTATNIE RUNDY GIER ${activeOnly ? "(TYLKO AKTYWNE)" : ""} ===`);
    console.table(
      rounds.map((r) => ({
        ID: r.id.slice(0, 8) + "...",
        Gracz: r.nick,
        Gra: r.game,
        Status: r.state,
        Stawka: formatFgt(r.bet),
        Wygrana: formatFgt(r.payout),
        Wynik: r.result,
        Kiedy: formatTime(r.created_at),
      }))
    );
    return;
  }

  if (sub === "cancel") {
    const roundId = args[1];
    if (!roundId) {
      console.error("Użycie: pnpm admin rounds cancel <round_id>");
      return;
    }

    const [r] = await sql`
      SELECT id, user_id, game, state, bet FROM game_rounds WHERE id = ${roundId}
    `;
    if (!r) {
      console.error(`Nie znaleziono rundy "${roundId}".`);
      return;
    }
    if (r.state !== "active") {
      console.error(`Runda ${roundId} nie jest aktywna (status: ${r.state}).`);
      return;
    }

    const t = Date.now();
    let newBal = 0;
    await sql.begin(async (tx) => {
      await tx`SELECT nick FROM players WHERE user_id = ${r.user_id} FOR UPDATE`;
      const [balRow] = await tx`
        SELECT COALESCE(SUM(amount), 0)::bigint as sum FROM ledger_entries WHERE user_id = ${r.user_id}
      `;
      const curBal = Number(balRow?.sum || 0);
      newBal = curBal + Number(r.bet);

      await tx`
        UPDATE game_rounds
        SET state = 'cancelled', result = 'Anulowano przez administratora (zwrot stawki)', settled_at = ${t}
        WHERE id = ${r.id}
      `;
      await tx`
        INSERT INTO ledger_entries (id, user_id, round_id, type, amount, balance_after, created_at)
        VALUES (${crypto.randomUUID()}, ${r.user_id}, ${r.id}, 'grant', ${r.bet}, ${newBal}, ${t})
      `;
      await tx`UPDATE players SET updated_at = ${t} WHERE user_id = ${r.user_id}`;
    });

    console.log(`✓ Anulowano aktywną rundę ${roundId}. Zwrócono stawkę ${formatFgt(r.bet)} na konto gracza.`);
    return;
  }

  console.log("Nieznane polecenie rounds. Dostępne: list, cancel");
}

async function handleFraud(sql, args) {
  const sub = args[0] || "list";

  if (sub === "list") {
    const logs = await sql`
      SELECT id, user_id, nick, previous_balance, reason, details, created_at, restored_at
      FROM fraud_logs
      ORDER BY created_at DESC
      LIMIT 30
    `;

    console.log(`\n=== LOGI ANTYFRAUDOWE (${logs.length}) ===`);
    if (logs.length === 0) {
      console.log("Brak zarejestrowanych incydentów.");
      return;
    }
    console.table(
      logs.map((l) => ({
        ID: l.id.slice(0, 8) + "...",
        Gracz: `${l.nick}`,
        "Zabrane Saldo": formatFgt(l.previous_balance),
        Powód: l.reason,
        Kiedy: formatTime(l.created_at),
        Przywrócono: l.restored_at ? formatTime(l.restored_at) : "NIE",
      }))
    );
    return;
  }

  if (sub === "penalize") {
    const id = args[1];
    const reason = args.slice(2).join(" ") || "Decyzja administratora";
    if (!id) {
      console.error("Użycie: pnpm admin fraud penalize <nick|user_id|email> [powód]");
      return;
    }
    const p = await resolvePlayer(sql, id);
    if (!p) {
      console.error(`Nie znaleziono gracza "${id}".`);
      return;
    }

    const t = Date.now();
    const logId = crypto.randomUUID();
    let clearedAmount = 0;

    await sql.begin(async (tx) => {
      await tx`SELECT nick FROM players WHERE user_id = ${p.user_id} FOR UPDATE`;
      const [balRow] = await tx`
        SELECT COALESCE(SUM(amount), 0)::bigint AS sum FROM ledger_entries WHERE user_id = ${p.user_id}
      `;
      clearedAmount = Number(balRow?.sum || 0);

      await tx`
        UPDATE game_rounds
        SET state = 'cancelled', result = 'Anulowano - interwencja admina', settled_at = ${t}
        WHERE user_id = ${p.user_id} AND state = 'active'
      `;
      if (clearedAmount > 0) {
        await tx`
          INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
          VALUES (${crypto.randomUUID()}, ${p.user_id}, 'fraud_penalty', ${-clearedAmount}, 0, ${t})
        `;
      }
      await tx`
        INSERT INTO fraud_logs (id, user_id, nick, previous_balance, reason, details, created_at)
        VALUES (${logId}, ${p.user_id}, ${p.nick}, ${clearedAmount}, ${reason}, 'Manual admin action', ${t})
      `;
      await tx`UPDATE players SET updated_at = ${t} WHERE user_id = ${p.user_id}`;
    });

    console.log(`✓ Wyzerowano konto gracza "${p.nick}". Zabrano ${formatFgt(clearedAmount)}. Zapisano w fraud_logs ID: ${logId}`);
    return;
  }

  if (sub === "restore") {
    const targetId = args[1];
    if (!targetId) {
      console.error("Użycie: pnpm admin fraud restore <ID_WPISU>");
      return;
    }

    const [log] = await sql`
      SELECT id, user_id, nick, previous_balance, restored_at
      FROM fraud_logs
      WHERE id = ${targetId} OR id LIKE ${targetId + "%"}
    `;
    if (!log) {
      console.error(`Nie znaleziono wpisu "${targetId}".`);
      return;
    }
    if (log.restored_at) {
      console.error(`Wpis został już przywrócony ${formatTime(log.restored_at)}.`);
      return;
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

      await tx`UPDATE players SET updated_at = ${t} WHERE user_id = ${log.user_id}`;
      await tx`
        INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
        VALUES (${crypto.randomUUID()}, ${log.user_id}, 'fraud_restoration', ${log.previous_balance}, ${newBal}, ${t})
      `;
      await tx`UPDATE fraud_logs SET restored_at = ${t} WHERE id = ${log.id}`;
    });

    console.log(`✓ Przywrócono ${formatFgt(log.previous_balance)} dla gracza "${log.nick}". Nowe saldo: ${formatFgt(newBal)}`);
    return;
  }

  console.log("Nieznane polecenie fraud. Dostępne: list, penalize, restore");
}

async function handleStats(sql) {
  const [general] = await sql`
    SELECT 
      COUNT(DISTINCT p.user_id)::int AS total_players,
      COUNT(g.id)::int AS total_rounds,
      COALESCE(SUM(g.bet), 0)::bigint AS total_wagered,
      COALESCE(SUM(g.payout), 0)::bigint AS total_payout
    FROM players p
    LEFT JOIN game_rounds g ON p.user_id = g.user_id
  `;

  const [ledgerSum] = await sql`
    SELECT COALESCE(SUM(amount), 0)::bigint AS sum FROM ledger_entries
  `;

  const byGame = await sql`
    SELECT 
      game,
      COUNT(*)::int AS count,
      COALESCE(SUM(bet), 0)::bigint AS wagered,
      COALESCE(SUM(payout), 0)::bigint AS payout
    FROM game_rounds
    GROUP BY game
    ORDER BY count DESC
  `;

  const totalWagered = Number(general?.total_wagered || 0);
  const totalPayout = Number(general?.total_payout || 0);
  const houseProfit = totalWagered - totalPayout;
  const rtp = totalWagered > 0 ? ((totalPayout / totalWagered) * 100).toFixed(2) : "0.00";

  console.log("\n================ GŁÓWNE STATYSTYKI KASYNA ================");
  console.log(`Zarejestrowanych graczy:  ${general?.total_players || 0}`);
  console.log(`Łączna liczba rund:       ${general?.total_rounds || 0}`);
  console.log(`Łączna suma zakładów:     ${formatFgt(totalWagered)}`);
  console.log(`Łączna suma wypłat:       ${formatFgt(totalPayout)}`);
  console.log(`Wynik kasyna (House Net): ${houseProfit >= 0 ? "+" : ""}${formatFgt(houseProfit)}`);
  console.log(`Średni RTP kasyna:        ${rtp}%`);
  console.log(`Aktywne żetony w obiegu:  ${formatFgt(ledgerSum?.sum || 0)}`);
  console.log("---------------- ROZKŁAD WG GIER ------------------------");
  console.table(
    byGame.map((g) => ({
      Gra: g.game,
      Rundy: g.count,
      Postawiono: formatFgt(g.wagered),
      Wypłacono: formatFgt(g.payout),
      RTP: g.wagered > 0 ? `${((g.payout / g.wagered) * 100).toFixed(1)}%` : "0%",
    }))
  );
  console.log("=========================================================\n");
}

function printHelp() {
  console.log(`
Kasyno 2FGT — Panel Administracyjny CLI
=======================================

Użycie: pnpm admin <moduł> <polecenie> [argumenty]

Moduły:
  players
    list                                  - Lista wszystkich graczy i ich sald
    show <nick|id|email>                  - Szczegółowa karta gracza i statystyki
    rename <nick|id|email> <nowy_nick>    - Zmiana nicku gracza
    reset-bonus <nick|id|email>           - Reset timeru codziennego bonusu

  ledger
    audit                                 - Audyt spójności księgi transakcji
    grant <nick|id|email> <kwota> [powód] - Dodanie/odjęcie żetonów graczowi
    history <nick|id|email> [limit]       - Wyświetlenie historii transakcji gracza

  rounds
    list [limit] [--active]               - Lista ostatnich lub trwających rund
    cancel <round_id>                     - Anulowanie zawieszonej rundy i zwrot stawki

  fraud
    list                                  - Historia wykrytych prób oszustwa
    penalize <nick|id|email> [powód]      - Ręczne wyzerowanie konta oszusta
    restore <fraud_log_id>                - Przywrócenie niesłusznie skasowanego salda

  stats                                   - Statystyki kasyna, RTP, obrót i zysk
`);
}

async function main() {
  const [moduleName, ...rest] = process.argv.slice(2);

  if (!moduleName || moduleName === "help" || moduleName === "--help" || moduleName === "-h") {
    printHelp();
    return;
  }

  const sql = await createClient();

  try {
    switch (moduleName) {
      case "players":
        await handlePlayers(sql, rest);
        break;
      case "ledger":
        await handleLedger(sql, rest);
        break;
      case "rounds":
        await handleRounds(sql, rest);
        break;
      case "fraud":
        await handleFraud(sql, rest);
        break;
      case "stats":
        await handleStats(sql);
        break;
      default:
        console.error(`Nieznany moduł: "${moduleName}". Wpisz "pnpm admin help" po pomoc.`);
        process.exitCode = 1;
        break;
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((err) => {
  console.error("Błąd CLI:", err.message);
  process.exit(1);
});
