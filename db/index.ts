import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

let _sql: postgres.Sql | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _tablesInitialized = false;

export function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return "postgres://kasyno:kasyno_pass@127.0.0.1:5432/kasyno";
}

export function getSql(): postgres.Sql {
  if (!_sql) {
    const url = getDatabaseUrl();
    _sql = postgres(url, {
      max: 20,
      idle_timeout: 30,
      connect_timeout: 10,
      transform: {
        undefined: null,
      },
      types: {
        bigint: {
          to: 20,
          from: [20],
          parse: (x: string) => Number(x),
          serialize: (x: unknown) => String(x),
        },
      },
    });
  }
  return _sql;
}

export function getDb() {
  if (!_db) {
    const sql = getSql();
    _db = drizzle(sql, { schema });
  }
  return _db;
}

export async function initPgTables() {
  if (_tablesInitialized) return;
  const sql = getSql();
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS players (
      user_id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      nick TEXT NOT NULL,
      balance BIGINT NOT NULL DEFAULT 1000,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      streak INTEGER NOT NULL DEFAULT 0,
      last_bonus_day TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_players_nick_unique ON players (nick);

    CREATE TABLE IF NOT EXISTS daily_claims (
      user_id TEXT NOT NULL,
      claim_day TEXT NOT NULL,
      amount BIGINT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, claim_day)
    );

    CREATE TABLE IF NOT EXISTS daily_mission_claims (
      user_id TEXT NOT NULL,
      claim_day TEXT NOT NULL,
      mission_id TEXT NOT NULL DEFAULT 'daily_5_rounds',
      amount BIGINT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, claim_day, mission_id)
    );

    CREATE TABLE IF NOT EXISTS game_rounds (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      game TEXT NOT NULL,
      state TEXT NOT NULL,
      bet BIGINT NOT NULL,
      payout BIGINT NOT NULL DEFAULT 0,
      result TEXT NOT NULL,
      payload TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL,
      settled_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_game_rounds_user_state ON game_rounds (user_id, state);
    CREATE INDEX IF NOT EXISTS idx_game_rounds_user_created ON game_rounds (user_id, created_at);

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      round_id TEXT,
      type TEXT NOT NULL,
      amount BIGINT NOT NULL,
      balance_after BIGINT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_user_created ON ledger_entries (user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_round ON ledger_entries (round_id);

    CREATE TABLE IF NOT EXISTS fraud_logs (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      nick TEXT NOT NULL,
      previous_balance BIGINT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT,
      created_at BIGINT NOT NULL,
      restored_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_fraud_logs_user ON fraud_logs (user_id);
    CREATE INDEX IF NOT EXISTS idx_fraud_logs_created ON fraud_logs (created_at);

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_players_balance_non_negative') THEN
        ALTER TABLE players ADD CONSTRAINT check_players_balance_non_negative CHECK (balance >= 0);
      END IF;
    END $$;
  `);
  _tablesInitialized = true;
}
