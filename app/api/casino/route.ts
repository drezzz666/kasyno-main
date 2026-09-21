import { headers } from "next/headers";
import { getSql, initPgTables } from "@/db";
import { parseCookie, verifySession } from "@/lib/auth/session";
import type postgres from "postgres";

type RootSql = postgres.Sql;
type Sql = postgres.Sql | postgres.TransactionSql;

async function runWithTx<T>(sql: Sql, fn: (tx: Sql) => Promise<T>): Promise<T> {
  if ("begin" in sql && typeof (sql as any).begin === "function") {
    return (sql as any).begin((tx: Sql) => fn(tx));
  }
  return fn(sql);
}

type Player = {
  user_id: string;
  email: string;
  nick: string;
  balance: number;
  xp: number;
  level: number;
  streak: number;
  last_bonus_day: string | null;
};

type Round = {
  id: string;
  game: string;
  state: string;
  bet: number;
  payout: number;
  result: string;
  payload: string;
  revision: number;
  created_at: number;
};

const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const suits = ["♠", "♥", "♦", "♣"];
const symbols = ["2", "F", "G", "T", "◆", "♛"];
export const MIN_BET = 1;
export const MAX_BET = 7_000;
export const MAX_PAYOUT = 252_000;
const dailyBonus = (streak: number) => Math.min(100 + streak * 50, 1000);
const now = () => Date.now();
const id = () => crypto.randomUUID();
const rand = (max: number) => crypto.getRandomValues(new Uint32Array(1))[0] % max;
const json = (data: unknown, status = 200) => Response.json(data, { status });

const lastActionTimes = new Map<string, number>();
const ACTION_COOLDOWN_MS = 150;

function checkRateLimit(userId: string): boolean {
  const currentTime = Date.now();
  const last = lastActionTimes.get(userId) || 0;
  if (currentTime - last < ACTION_COOLDOWN_MS) {
    return false;
  }
  lastActionTimes.set(userId, currentTime);
  if (lastActionTimes.size > 5000) {
    for (const [k, t] of lastActionTimes) {
      if (currentTime - t > 60000) lastActionTimes.delete(k);
    }
  }
  return true;
}

async function getRoundsToday(sql: Sql, userId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const [row] = await sql<{ count: string }[]>`
    SELECT count(*) as count FROM game_rounds
    WHERE user_id = ${userId} AND state = 'settled'
      AND (settled_at >= ${todayStart.getTime()} OR (settled_at IS NULL AND created_at >= ${todayStart.getTime()}))
  `;
  return row ? parseInt(row.count, 10) : 0;
}

async function identity() {
  const h = await headers();
  const cookieHeader = h.get("cookie");
  const sessionToken = parseCookie(cookieHeader, "casino_session");
  if (!sessionToken) throw new Error("UNAUTHORIZED");
  const session = await verifySession(sessionToken);
  if (!session) throw new Error("UNAUTHORIZED");
  return { userId: session.userId, email: session.email, nick: session.nick };
}

function normalizePlayer(p: Player): Player {
  return {
    ...p,
    balance: Number(p.balance),
    xp: Number(p.xp),
    level: Number(p.level),
    streak: Number(p.streak),
  };
}

async function player(): Promise<Player> {
  const { userId, email, nick: sessionNick } = await identity();
  await initPgTables();
  const sql = getSql();
  const [p] = await sql<Player[]>`SELECT * FROM players WHERE user_id = ${userId}`;
  if (!p) {
    const nick = (sessionNick || email.split("@")[0] || "Gracz").slice(0, 30);
    const t = now();
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO players (user_id, email, nick, balance, xp, level, streak, created_at, updated_at)
        VALUES (${userId}, ${email}, ${nick}, 1000, 0, 1, 0, ${t}, ${t})
      `;
      await tx`
        INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
        VALUES (${id()}, ${userId}, 'welcome_bonus', 1000, 1000, ${t})
      `;
    });
    const [newP] = await sql<Player[]>`SELECT * FROM players WHERE user_id = ${userId}`;
    return normalizePlayer(newP);
  } else if (sessionNick && p.nick !== sessionNick) {
    const [taken] = await sql<{ user_id: string }[]>`
      SELECT user_id FROM players WHERE nick = ${sessionNick} AND user_id != ${userId}
    `;
    if (!taken) {
      await sql`UPDATE players SET nick = ${sessionNick} WHERE user_id = ${userId}`;
      p.nick = sessionNick;
    }
  }
  return normalizePlayer(p);
}

function card() {
  return { rank: ranks[rand(ranks.length)], suit: suits[rand(suits.length)] };
}

function value(cards: { rank: string }[]) {
  let n = 0,
    aces = 0;
  for (const c of cards) {
    if (c.rank === "A") {
      n += 11;
      aces++;
    } else {
      n += ["J", "Q", "K"].includes(c.rank) ? 10 : Number(c.rank);
    }
  }
  while (n > 21 && aces) {
    n -= 10;
    aces--;
  }
  return n;
}

function rouletteColor(n: number) {
  return n === 0 ? "green" : reds.has(n) ? "red" : "black";
}

function mineMultiplier(revealed: number, mines: number) {
  let chance = 1;
  for (let i = 0; i < revealed; i++) chance *= (25 - mines - i) / (25 - i);
  const fair = 0.97 / chance;
  const damp = mines >= 5 ? 1 : 0.25 + 0.75 * ((mines - 2) / 3);
  const profit = Math.max(0, fair - 1) * damp;
  return Math.max(1, Math.floor((1 + profit) * 100) / 100);
}

function publicPayload(game: string, payload: any) {
  const safe = typeof payload === "string" ? JSON.parse(payload) : JSON.parse(JSON.stringify(payload));
  if (game === "mines") safe.mines = [];
  if (game === "blackjack" && safe.dealer?.length > 1) safe.dealer = [safe.dealer[0], { rank: "?", suit: "" }];
  return safe;
}

function publicRound(r: any) {
  return { ...r, payload: publicPayload(r.game, r.payload) };
}

function publicActive(r: Round | null | undefined) {
  return r ? publicRound(r) : null;
}

export async function GET() {
  try {
    const p = await player();
    const sql = getSql();
    const [active] = await sql<Round[]>`
      SELECT * FROM game_rounds WHERE user_id = ${p.user_id} AND state = 'active' ORDER BY created_at DESC LIMIT 1
    `;
    const historyRaw = await sql`
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
      WHERE l.user_id = ${p.user_id}
      ORDER BY l.created_at DESC
      LIMIT 10
    `;
    const history = historyRaw.map((e) => ({
      ...e,
      amount: Number(e.amount),
      balanceAfter: Number(e.balanceAfter),
      createdAt: Number(e.createdAt),
      bet: e.bet !== null && e.bet !== undefined ? Number(e.bet) : null,
      payout: e.payout !== null && e.payout !== undefined ? Number(e.payout) : null,
    }));

    const [totalHistoryRow] = await sql<{ count: string }[]>`
      SELECT count(*) as count FROM ledger_entries WHERE user_id = ${p.user_id}
    `;
    const totalHistory = totalHistoryRow ? parseInt(totalHistoryRow.count, 10) : 0;

    const today = new Date().toISOString().slice(0, 10);
    const roundsToday = await getRoundsToday(sql, p.user_id);
    const [missionClaimRow] = await sql`
      SELECT 1 FROM daily_mission_claims WHERE user_id = ${p.user_id} AND claim_day = ${today} AND mission_id = 'daily_5_rounds'
    `;
    const missionClaimed = !!missionClaimRow;

    const leadersRaw = await sql`
      SELECT nick, balance, level FROM players ORDER BY balance DESC LIMIT 5
    `;
    const leaders = leadersRaw.map((l) => ({
      ...l,
      balance: Number(l.balance),
      level: Number(l.level),
    }));

    return json({
      player: p,
      active: publicActive(active),
      history,
      hasMoreHistory: totalHistory > history.length,
      roundsToday,
      missionClaimed,
      missionReward: 250,
      leaders,
      today,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return json({ error: "Zaloguj się przez Authentik, aby zagrać." }, 401);
    }
    return json({ error: e instanceof Error ? e.message : "Błąd serwera" }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const p = await player();
    if (!checkRateLimit(p.user_id)) {
      return json({ error: "Zbyt wiele zapytań. Odczekaj chwilę." }, 429);
    }
    const sql = getSql();

    if (body.action === "bonus") {
      const day = new Date().toISOString().slice(0, 10);
      if (p.last_bonus_day === day) return json({ error: "Dzisiejszy bonus został już odebrany." }, 409);
      const prev = p.last_bonus_day ? new Date(p.last_bonus_day + "T00:00:00Z").getTime() : 0;
      const yesterday = new Date(day + "T00:00:00Z").getTime() - 86400000;
      const streak = prev === yesterday ? p.streak + 1 : 1;
      const amount = dailyBonus(streak);
      const t = now();
      let newBal = 0;

      await sql.begin(async (tx) => {
        const claimRes = await tx`
          INSERT INTO daily_claims(user_id, claim_day, amount, created_at)
          VALUES(${p.user_id}, ${day}, ${amount}, ${t})
          ON CONFLICT DO NOTHING
        `;
        if (claimRes.count === 0) {
          throw new Error("ALREADY_CLAIMED");
        }
        const [updated] = await tx<{ balance: number }[]>`
          UPDATE players
          SET balance = balance + ${amount}, streak = ${streak}, last_bonus_day = ${day}, updated_at = ${t}
          WHERE user_id = ${p.user_id}
          RETURNING balance
        `;
        newBal = Number(updated.balance);
        await tx`INSERT INTO ledger_entries(id, user_id, type, amount, balance_after, created_at)
          VALUES(${id()}, ${p.user_id}, 'daily_bonus', ${amount}, ${newBal}, ${t})`;
      });

      return json({ ok: true, amount, balance: newBal, streak });
    }

    if (body.action === "claim_mission" || body.action === "mission") {
      const day = new Date().toISOString().slice(0, 10);
      const roundsToday = await getRoundsToday(sql, p.user_id);
      if (roundsToday < 5) return json({ error: "Musisz rozegrać co najmniej 5 rund, aby odebrać nagrodę." }, 400);

      const amount = 250;
      const t = now();
      let newBal = 0;

      await sql.begin(async (tx) => {
        const claimRes = await tx`
          INSERT INTO daily_mission_claims(user_id, claim_day, mission_id, amount, created_at)
          VALUES(${p.user_id}, ${day}, 'daily_5_rounds', ${amount}, ${t})
          ON CONFLICT DO NOTHING
        `;
        if (claimRes.count === 0) {
          throw new Error("ALREADY_CLAIMED");
        }
        const [updated] = await tx<{ balance: number }[]>`
          UPDATE players
          SET balance = balance + ${amount}, updated_at = ${t}
          WHERE user_id = ${p.user_id}
          RETURNING balance
        `;
        newBal = Number(updated.balance);
        await tx`INSERT INTO ledger_entries(id, user_id, type, amount, balance_after, created_at)
          VALUES(${id()}, ${p.user_id}, 'daily_mission', ${amount}, ${newBal}, ${t})`;
      });

      return json({ ok: true, amount, balance: newBal, missionClaimed: true });
    }

    if (body.action === "deal_blackjack") return dealBlackjack(p, sql, body);
    if (body.action === "blackjack") return actBlackjack(p, sql, body);
    if (body.action === "start_mines") return startMines(p, sql, body);
    if (body.action === "mines") return actMines(p, sql, body);
    return instantGame(p, sql, body);
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHORIZED") {
      return json({ error: "Zaloguj się przez Authentik, aby zagrać." }, 401);
    }
    if (e instanceof Error && (e.message === "ALREADY_CLAIMED" || e.message === "ROUND_ALREADY_SETTLED")) {
      return json({ error: "Akcja została już przetworzona." }, 409);
    }
    if (e instanceof Error && e.message === "INSUFFICIENT_FUNDS") {
      return json({ error: "Niewystarczające saldo żetonów." }, 400);
    }
    return json({ error: e instanceof Error ? e.message : "Błąd serwera" }, 500);
  }
}

async function instantGame(p: Player, sql: RootSql, b: Record<string, unknown>) {
  const game = String(b.game || "");
  const bet = Math.floor(Number(b.bet));
  if (!["roulette", "slots"].includes(game)) return json({ error: "Nieznana gra." }, 400);
  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET || bet > p.balance) return json({ error: "Nieprawidłowa stawka." }, 400);

  let payout = 0;
  let result = "";
  let payload: unknown;

  if (game === "roulette") {
    const n = rand(37);
    const color = rouletteColor(n);
    const choice = String(b.choice || "red");
    const straight = /^\d+$/.test(choice);
    let win = straight ? Number(choice) === n : choice === color;
    if (choice === "even") win = n > 0 && n % 2 === 0;
    if (choice === "odd") win = n % 2 === 1;
    if (choice === "low") win = n >= 1 && n <= 18;
    if (choice === "high") win = n >= 19 && n <= 36;
    if (choice.startsWith("dozen")) {
      const dozen = Number(choice.slice(5));
      win = n > 0 && Math.ceil(n / 12) === dozen;
    }
    const multiplier = straight ? 36 : choice.startsWith("dozen") ? 3 : 2;
    payout = win ? bet * multiplier : 0;
    result = `${n} · ${color}`;
    payload = { number: n, color, choice, multiplier };
  } else {
    const reels = Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => symbols[rand(symbols.length)]));
    const mid = reels.map((r) => r[1]);
    const counts = new Map<string, number>();
    mid.forEach((s) => counts.set(s, (counts.get(s) || 0) + 1));
    const best = Math.max(...counts.values());
    payout = best >= 3 ? bet * (best === 5 ? 12 : best === 4 ? 6 : 2) : 0;
    result = payout ? `Wygrana ×${payout / bet}` : "Brak wygranej";
    payload = { reels, winning: best >= 3 };
  }

  return settle(p, sql, game, bet, payout, result, payload);
}

async function dealBlackjack(p: Player, sql: RootSql, b: Record<string, unknown>) {
  const bet = Math.floor(Number(b.bet));
  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET || bet > p.balance) return json({ error: "Nieprawidłowa stawka." }, 400);

  const [active] = await sql<{ id: string }[]>`
    SELECT id FROM game_rounds WHERE user_id = ${p.user_id} AND state = 'active'
  `;
  if (active) return json({ error: "Najpierw dokończ aktywną rundę." }, 409);

  const cards = [card(), card()];
  const dealer = [card(), card()];
  const rid = id();
  const t = now();
  const payload = { cards, dealer, actions: ["hit", "stand"] };

  let balAfterBet = 0;
  await sql.begin(async (tx) => {
    const res = await tx<{ balance: number }[]>`
      UPDATE players
      SET balance = balance - ${bet}, updated_at = ${t}
      WHERE user_id = ${p.user_id} AND balance >= ${bet}
      RETURNING balance
    `;
    if (res.count === 0) throw new Error("INSUFFICIENT_FUNDS");
    balAfterBet = Number(res[0].balance);
    await tx`INSERT INTO game_rounds(id, user_id, game, state, bet, payout, result, payload, revision, created_at)
      VALUES(${rid}, ${p.user_id}, 'blackjack', 'active', ${bet}, 0, 'W toku', ${JSON.stringify(payload)}, 1, ${t})`;
    await tx`INSERT INTO ledger_entries(id, user_id, round_id, type, amount, balance_after, created_at)
      VALUES(${id()}, ${p.user_id}, ${rid}, 'bet', ${-bet}, ${balAfterBet}, ${t})`;
  });

  if (value(cards) === 21 || value(dealer) === 21) {
    return finishBlackjack(p, sql, rid, { ...payload }, 2, balAfterBet);
  }

  return json({ ok: true, round: publicRound({ id: rid, game: "blackjack", bet, state: "active", payload }), balance: balAfterBet });
}

async function actBlackjack(p: Player, sql: RootSql, b: Record<string, unknown>) {
  const rid = String(b.roundId || "");
  const act = String(b.move || "");
  if (!["hit", "stand", "double"].includes(act)) {
    return json({ error: "Nieprawidłowy ruch." }, 400);
  }

  return await sql.begin(async (tx) => {
    const [r] = await tx<Round[]>`
      SELECT * FROM game_rounds WHERE id = ${rid} AND user_id = ${p.user_id} AND state = 'active' FOR UPDATE
    `;
    if (!r) return json({ error: "Aktywna runda nie istnieje." }, 404);

    const payload = JSON.parse(r.payload) as { cards: { rank: string; suit: string }[]; dealer: { rank: string; suit: string }[] };

    if (act === "double") {
      if (payload.cards.length !== 2) return json({ error: "Podwojenie jest dostępne tylko po rozdaniu." }, 400);
      if (p.balance < r.bet) return json({ error: "Za mało żetonów na podwojenie." }, 400);
      const t = now();

      const res = await tx<{ balance: number }[]>`
        UPDATE players
        SET balance = balance - ${r.bet}, updated_at = ${t}
        WHERE user_id = ${p.user_id} AND balance >= ${r.bet}
        RETURNING balance
      `;
      if (res.count === 0) throw new Error("INSUFFICIENT_FUNDS");
      const balAfterDouble = Number(res[0].balance);
      const roundRes = await tx`
        UPDATE game_rounds
        SET bet = bet * 2, revision = revision + 1
        WHERE id = ${r.id} AND revision = ${r.revision} AND state = 'active'
      `;
      if (roundRes.count === 0) throw new Error("ROUND_ALREADY_SETTLED");
      await tx`INSERT INTO ledger_entries(id, user_id, round_id, type, amount, balance_after, created_at)
        VALUES(${id()}, ${p.user_id}, ${r.id}, 'double', ${-r.bet}, ${balAfterDouble}, ${t})`;

      r.bet *= 2;
      payload.cards.push(card());
      return finishBlackjack(p, tx, rid, payload, r.revision + 2, balAfterDouble);
    }

    if (act === "hit") {
      payload.cards.push(card());
      if (value(payload.cards) < 21) {
        await tx`
          UPDATE game_rounds SET payload = ${JSON.stringify(payload)}, revision = revision + 1 WHERE id = ${rid} AND revision = ${r.revision} AND state = 'active'
        `;
        return json({ ok: true, round: publicRound({ ...r, payload, revision: r.revision + 1 }) });
      }
    }

    return finishBlackjack(p, tx, rid, payload, r.revision + 1, p.balance);
  });
}

async function finishBlackjack(
  p: Player,
  sql: Sql,
  rid: string,
  payload: { cards: { rank: string; suit: string }[]; dealer: { rank: string; suit: string }[] },
  revision: number,
  currentBalance: number
) {
  const [r] = await sql<Round[]>`
    SELECT * FROM game_rounds WHERE id = ${rid} AND user_id = ${p.user_id} AND state = 'active' FOR UPDATE
  `;
  if (!r) return json({ error: "Runda nie istnieje lub została już zakończona." }, 404);

  while (value(payload.dealer) < 17) payload.dealer.push(card());
  const pv = value(payload.cards);
  const dv = value(payload.dealer);
  const rawPayout =
    pv <= 21 && (dv > 21 || pv > dv)
      ? pv === 21 && payload.cards.length === 2
        ? Math.floor(r.bet * 2.5)
        : r.bet * 2
      : pv === dv && pv <= 21
      ? r.bet
      : 0;
  const payout = Math.min(MAX_PAYOUT, rawPayout);
  const result = payout > r.bet ? "Wygrana" : payout === r.bet ? "Remis" : "Przegrana";
  return settleExisting(p, sql, r, payout, result, payload, currentBalance, revision);
}

async function startMines(p: Player, sql: RootSql, b: Record<string, unknown>) {
  const bet = Math.floor(Number(b.bet));
  const mineCount = Math.max(2, Math.min(12, Math.floor(Number(b.mines) || 5)));
  if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET || bet > p.balance) return json({ error: "Nieprawidłowa stawka." }, 400);

  const [active] = await sql<{ id: string }[]>`
    SELECT id FROM game_rounds WHERE user_id = ${p.user_id} AND state = 'active'
  `;
  if (active) return json({ error: "Najpierw dokończ aktywną rundę." }, 409);

  const mines = new Set<number>();
  while (mines.size < mineCount) mines.add(rand(25));
  const payload = { mines: [...mines], revealed: [] as number[], mineCount, multiplier: 1 };
  const rid = id();
  const t = now();

  let balAfterBet = 0;
  await sql.begin(async (tx) => {
    const res = await tx<{ balance: number }[]>`
      UPDATE players
      SET balance = balance - ${bet}, updated_at = ${t}
      WHERE user_id = ${p.user_id} AND balance >= ${bet}
      RETURNING balance
    `;
    if (res.count === 0) throw new Error("INSUFFICIENT_FUNDS");
    balAfterBet = Number(res[0].balance);
    await tx`INSERT INTO game_rounds(id, user_id, game, state, bet, payout, result, payload, revision, created_at)
      VALUES(${rid}, ${p.user_id}, 'mines', 'active', ${bet}, 0, 'W toku', ${JSON.stringify(payload)}, 1, ${t})`;
    await tx`INSERT INTO ledger_entries(id, user_id, round_id, type, amount, balance_after, created_at)
      VALUES(${id()}, ${p.user_id}, ${rid}, 'bet', ${-bet}, ${balAfterBet}, ${t})`;
  });

  return json({ ok: true, round: { id: rid, game: "mines", bet, state: "active", payload: { ...payload, mines: [] } }, balance: balAfterBet });
}

async function actMines(p: Player, sql: RootSql, b: Record<string, unknown>) {
  const rid = String(b.roundId || "");
  const isCashout = String(b.move) === "cashout";
  const tile = Math.floor(Number(b.tile));

  if (!isCashout && (!Number.isInteger(tile) || tile < 0 || tile > 24)) {
    return json({ error: "Nieprawidłowe pole." }, 400);
  }

  return await sql.begin(async (tx) => {
    const [r] = await tx<Round[]>`
      SELECT * FROM game_rounds WHERE id = ${rid} AND user_id = ${p.user_id} AND state = 'active' FOR UPDATE
    `;
    if (!r) return json({ error: "Aktywna runda nie istnieje." }, 404);

    const payload = JSON.parse(r.payload) as { mines: number[]; revealed: number[]; mineCount: number; multiplier: number };

    if (isCashout) {
      if (!payload.revealed.length) return json({ error: "Odkryj przynajmniej jedno pole." }, 400);
      const rawPayout = Math.floor(r.bet * payload.multiplier);
      const payout = Math.min(MAX_PAYOUT, rawPayout);
      return settleExisting(p, tx, r, payout, `Cash-out ×${payload.multiplier.toFixed(2)}`, payload, p.balance, r.revision + 1);
    }

    if (payload.revealed.includes(tile)) return json({ error: "Pole już odkryte." }, 400);
    if (payload.mines.includes(tile)) return settleExisting(p, tx, r, 0, "Trafiona mina", payload, p.balance, r.revision + 1);

    payload.revealed.push(tile);
    payload.multiplier = mineMultiplier(payload.revealed.length, payload.mineCount);

    if (payload.revealed.length === 25 - payload.mineCount) {
      const rawPayout = Math.floor(r.bet * payload.multiplier);
      const payout = Math.min(MAX_PAYOUT, rawPayout);
      return settleExisting(p, tx, r, payout, `Maksymalna wygrana ×${payload.multiplier.toFixed(2)}`, payload, p.balance, r.revision + 1);
    }

    await tx`
      UPDATE game_rounds SET payload = ${JSON.stringify(payload)}, revision = revision + 1 WHERE id = ${r.id} AND revision = ${r.revision} AND state = 'active'
    `;
    return json({ ok: true, round: { ...r, payload: { ...payload, mines: [] }, revision: r.revision + 1 } });
  });
}

async function settle(p: Player, sql: RootSql, game: string, bet: number, payout: number, result: string, payload: unknown) {
  const rid = id();
  const t = now();
  const cappedPayout = Math.min(MAX_PAYOUT, Math.max(0, Number(payout)));
  const net = cappedPayout - Number(bet);
  const xp = p.xp + 10;
  const level = 1 + Math.floor(xp / 500);

  let newBal = 0;
  await sql.begin(async (tx) => {
    const res = await tx<{ balance: number }[]>`
      UPDATE players
      SET balance = balance + ${net}, xp = ${xp}, level = ${level}, updated_at = ${t}
      WHERE user_id = ${p.user_id} AND balance >= ${bet}
      RETURNING balance
    `;
    if (res.count === 0) throw new Error("INSUFFICIENT_FUNDS");
    newBal = Number(res[0].balance);
    await tx`INSERT INTO game_rounds(id, user_id, game, state, bet, payout, result, payload, revision, created_at, settled_at)
      VALUES(${rid}, ${p.user_id}, ${game}, 'settled', ${bet}, ${cappedPayout}, ${result}, ${JSON.stringify(payload)}, 1, ${t}, ${t})`;
    await tx`INSERT INTO ledger_entries(id, user_id, round_id, type, amount, balance_after, created_at)
      VALUES(${id()}, ${p.user_id}, ${rid}, 'round', ${net}, ${newBal}, ${t})`;
  });

  const roundsToday = await getRoundsToday(sql, p.user_id);
  return json({
    ok: true,
    round: { id: rid, game, bet, payout: cappedPayout, result, payload, state: "settled" },
    balance: newBal,
    xp,
    level,
    roundsToday,
  });
}

async function settleExisting(
  p: Player,
  sql: Sql,
  r: Round,
  payout: number,
  result: string,
  payload: unknown,
  _currentBalance: number,
  revision: number
) {
  const t = now();
  const xp = p.xp + 10;
  const level = 1 + Math.floor(xp / 500);
  const pay = Math.min(MAX_PAYOUT, Math.max(0, Number(payout)));

  let newBal = 0;
  await runWithTx(sql, async (tx) => {
    const roundRes = await tx`
      UPDATE game_rounds
      SET state = 'settled', payout = ${pay}, result = ${result}, payload = ${JSON.stringify(payload)}, revision = ${revision}, settled_at = ${t}
      WHERE id = ${r.id} AND state = 'active'
    `;
    if (roundRes.count === 0) {
      throw new Error("ROUND_ALREADY_SETTLED");
    }
    const [updatedPlayer] = await tx<{ balance: number }[]>`
      UPDATE players
      SET balance = balance + ${pay}, xp = ${xp}, level = ${level}, updated_at = ${t}
      WHERE user_id = ${p.user_id}
      RETURNING balance
    `;
    newBal = Number(updatedPlayer.balance);
    await tx`INSERT INTO ledger_entries(id, user_id, round_id, type, amount, balance_after, created_at)
      VALUES(${id()}, ${p.user_id}, ${r.id}, 'payout', ${pay}, ${newBal}, ${t})`;
  });

  const roundsToday = await getRoundsToday(sql, p.user_id);
  return json({
    ok: true,
    round: { ...r, state: "settled", payout: pay, result, payload },
    balance: newBal,
    xp,
    level,
    roundsToday,
  });
}
