import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;

function getDbPath(): string {
  const customPath = process.env.DATABASE_PATH;
  if (customPath) return customPath;

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, "casino.db");
}

export function getSqlite(): Database.Database {
  if (!_sqlite) {
    const dbPath = getDbPath();
    _sqlite = new Database(dbPath);
    _sqlite.pragma("journal_mode = WAL");
    _sqlite.pragma("foreign_keys = ON");
    initTables(_sqlite);
  }
  return _sqlite;
}

export function getDb() {
  if (!_db) {
    const sqlite = getSqlite();
    _db = drizzle(sqlite, { schema });
  }
  return _db;
}

function initTables(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS players (
      user_id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      nick TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 100,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      streak INTEGER NOT NULL DEFAULT 0,
      last_bonus_day TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_players_nick_unique ON players (nick);

    CREATE TABLE IF NOT EXISTS daily_claims (
      user_id TEXT NOT NULL,
      claim_day TEXT NOT NULL,
      amount INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, claim_day)
    );

    CREATE TABLE IF NOT EXISTS game_rounds (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      game TEXT NOT NULL,
      state TEXT NOT NULL,
      bet INTEGER NOT NULL,
      payout INTEGER NOT NULL DEFAULT 0,
      result TEXT NOT NULL,
      payload TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      settled_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_game_rounds_user_state ON game_rounds (user_id, state);
    CREATE INDEX IF NOT EXISTS idx_game_rounds_user_created ON game_rounds (user_id, created_at);

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      round_id TEXT,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_user_created ON ledger_entries (user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_round ON ledger_entries (round_id);
  `);
}
