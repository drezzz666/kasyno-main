import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const players = sqliteTable("players", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  nick: text("nick").notNull(),
  balance: integer("balance").notNull().default(25000),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  streak: integer("streak").notNull().default(0),
  lastBonusDay: text("last_bonus_day"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [uniqueIndex("idx_players_nick_unique").on(table.nick)]);

export const dailyClaims = sqliteTable("daily_claims", {
  userId: text("user_id").notNull(),
  claimDay: text("claim_day").notNull(),
  amount: integer("amount").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.claimDay] })]);

export const gameRounds = sqliteTable("game_rounds", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  game: text("game").notNull(),
  state: text("state").notNull(),
  bet: integer("bet").notNull(),
  payout: integer("payout").notNull().default(0),
  result: text("result").notNull(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  settledAt: integer("settled_at"),
}, (table) => [index("idx_game_rounds_user_state").on(table.userId, table.state), index("idx_game_rounds_user_created").on(table.userId, table.createdAt)]);

export const ledgerEntries = sqliteTable("ledger_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  roundId: text("round_id"),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("idx_ledger_entries_user_created").on(table.userId, table.createdAt), index("idx_ledger_entries_round").on(table.roundId)]);
